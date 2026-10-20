---
title: "Running Unique tasks in celery"
date: 2018-11-25
categories: 
  - "tech"
originalUrl: "https://vivekanandxyz.wordpress.com/2018/11/25/running-unique-tasks-in-celery/"
---

At my day job, we had a requirement to make one of the api endpoints fast. The endpoint was computation intense and was taking lot of time. After profiling the endpoint using [django-silk](https://github.com/jazzband/django-silk), we came to the conclusion that `sql` wasn't the issue.

One possible solution was to move the computation in a celery worker, put the results in a separate table and serve the web requests from the table directly. The computations for a particular loan was triggered by a couple of events which were easy to determine. Added benefit for us was that, we had other use cases for the table.

The uniqueness part comes in when the end result of computing multiple times is same as computing once (idempotent). If there are two workers and they start working on the computations for the same loan, they will produce same results and would end up updating the database with those results. To maintain uniqueness, we used locking using redis.

While working on this, i came across two solutions:
- **Discarding the task on the worker**
In this method, we would decorate our task with a function that would check if it can acquire the lock for the loan or not. If it can't acquire the lock this means that there is a worker working on this loan and we don't need to compute again so, it doesn't run any further. In this, we are using transaction aware task (it should work on the `Task` class exposed by `celery` as well but, for our use case we need `TransactionAwareTask`; https://gist.github.com/tapanpandita/46d2e2f63c7425547a865cb6298a172f  )

```python

def should_compute_for_loan(key):
    def decorated_func(func):
        @functools.wraps(func)
        def inner(*args, **kwargs):
            """
                Apply a lock on a key and checks if we should go ahead
                and run the celery task
            """
            has_lock, return_value = False, False
            loan_id = args[0]
            lock = cache.lock(key.format(loan_id=loan_id), timeout=600)
            try:
                has_lock = lock.acquire(blocking=False)
                if has_lock:
                    return_value = func(*args, **kwargs)
            finally:
                if has_lock:
                    lock.release()
            return return_value

        return inner

    return decorated_func

```

```python

@app.task(base=TransactionAwareTask)
@should_compute_for_loan(key='heavy_computation:{loan_id}')
def recompute_heavy_computation(loan_id):

```

The shortcoming with this method is that even if the computation is taking place only once, we still would need to publish the task which means the queue still gets flooded.

- **Discarding the task in django**

```python

class TransactionAwareUniqueTask(TransactionAwareTask):
    '''
        Makes sure that a task is computed only once using locking.
        The task itself is triggered by django as a callback when
        the transaction is committed successfully.
        Usage: subclassed_task.delay(some_args, key='some-namespacing-id-for-uniqueness')
    '''
    abstract = True

    def delay(self, *args, **kwargs):
        '''
            Makes a lock using redis for given key
        '''

        has_lock = False
        key = kwargs['key']
        lock = cache.lock(
            key, timeout=600, blocking_timeout=0.00001
        )
        has_lock = lock.acquire(blocking=False)
        if has_lock:
            LOGGER.debug("Lock acquired: %s", key)
            kwargs.pop('key')  # remove 'key' before passing to celery, it's not serialisable/needed by the worker
            super(TransactionAwareUniqueTask, self).delay(*args, **kwargs)
        else:
            LOGGER.debug("Can not get lock: %s", key)

```

and use it like:

```python

@app.task(base=TransactionAwareUniqueTask, acks_late=True)

```

I have used `acks_late` instead of the default because we want to ack `rmq` when the task has finished and not when it has received. This means that in case the worker dies after taking up the job, `rmq` will make sure that it doesn't remove the task from the queue.

The lock still needs to be removed by the worker thread because, once the computation is completed, you want to make sure that if there is a requirement to compute again within the timeout period of the lock, it's possible to do so. This can be achieved by using `task_postrun` signal provided by `celery`. This also gets triggered when the task fails to run for some reason, i.e, if an exception happens within the task.

```python

@task_postrun.connect(sender=recompute_heavy_computation)
def release_the_lock(*args, **kwargs):
    """
        Release the redis lock
    """

    key = kwargs['kwargs']['key']
    LOGGER.debug("About to delete: %s", key)
    cache.client.delete(key)
    LOGGER.debug("Deleted lock: %s", key)

```

This deletes the key instead of using the locking interface. This is one thing that bothers me a little but, i couldn't find any better solution. The lock itself needs to be acquired before releasing and you can't pass the lock object to the worker thread because it won't be json serialisable. This feels a bit hacky but, it sure worked.
