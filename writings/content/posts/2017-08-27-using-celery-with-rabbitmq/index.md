---
title: "Using Celery with Rabbitmq"
date: 2017-08-27
draft: true
archived: true
categories: 
  - "tech"
originalUrl: "https://vivekanandxyz.wordpress.com/2017/08/27/using-celery-with-rabbitmq/"
---

[Rabbitmq](https://www.google.co.in/url?sa=t&rct=j&q=&esrc=s&source=web&cd=1&cad=rja&uact=8&ved=0ahUKEwik9L3v-PfVAhXGMo8KHfpSDvYQFggnMAA&url=https%3A%2F%2Fwww.rabbitmq.com%2F&usg=AFQjCNGDosbIEgmvo7ybtwDm3q37XqGfbA) is a message broker and [celery](https://www.google.co.in/url?sa=t&rct=j&q=&esrc=s&source=web&cd=1&cad=rja&uact=8&ved=0ahUKEwid_MT6-PfVAhWMvI8KHaKVBbcQFggnMAA&url=http%3A%2F%2Fwww.celeryproject.org%2F&usg=AFQjCNGLo7UUJstLB7GtJlS-IyDXHq8E2A) is a task queue. When you run a celery app, by default, it will open as many processes as there are cores of cpu on the machine. These processes are workers. When you have a task which needs to be done outside of a normal HTTP request-response cycle,  you can use a task queue. Rabbitmq can be configured to decide (and deliver) which worker the task has to go and celery will help in the actual execution of the tasks.

Celery supports a lot of message brokers but, Rabbitmq is the default one. So, setting up celery for using with rabbitmq doesn't require any effort. If you have rabbitmq already installed then all you need to do is create a rabbitmq user, a virtual host and give the user access to the virtual host. It is given in the celery documentation [here](http://docs.celeryproject.org/en/latest/getting-started/brokers/rabbitmq.html#setting-up-rabbitmq).

Then you need to specify the broker url in this format in the celery app.

```python
broker_url = 'amqp://myuser:mypassword@localhost:5672/myvhost'
```
The default exchange that celery listens to is named '*celery*' and routing key is also '*celery*'. The '*celery*' exchange is direct type exchange. [AMQP](https://www.google.co.in/url?sa=t&rct=j&q=&esrc=s&source=web&cd=14&cad=rja&uact=8&ved=0ahUKEwjwqbzi-PfVAhUEOY8KHYquA9UQFghpMA0&url=https%3A%2F%2Fwww.amqp.org%2F&usg=AFQjCNFZfR8N8t3P8ZR3YGR4VU5dDmG0hg) is the protocol that rabbitmq follows. Username, password and virtual host here is of rabbitmq that you want celery to use. Based on the given broker url, celery attempts to know which message broker is being used.
