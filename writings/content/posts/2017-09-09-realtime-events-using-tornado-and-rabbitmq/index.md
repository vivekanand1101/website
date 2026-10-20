---
title: "Realtime Events using Tornado and Rabbitmq"
date: 2017-09-09
categories: 
  - "tech"
originalUrl: "https://vivekanandxyz.wordpress.com/2017/09/09/realtime-events-using-tornado-and-rabbitmq/"
---

At my day job, i needed a way to send real time events to clients that would in turn trigger some action on their side. The clients could ask for some computation from server which may take time.

To tackle this situation, i ended up making [Tornado](https://github.com/tornadoweb/tornado) as a websocket server which will be different from our web app server (and both behind [nginx](https://nginx.org/en/)). There are a couple of other services which the client may ask for indirectly. Since, those computations won't have normal request - response cycle, the results from the computations will have to pushed to the clients. Since, the communication between the client and server is two-way so, websocket seemed fitting. For routing of messages internally, i decided to use [Rabbitmq](https://www.rabbitmq.com/)
and [Celery](http://www.celeryproject.org/) for actual execution of tasks.

The problem with this is: Rabbitmq consumer and Tornado both run their own I/O loop. That confused me a little because i had heard this combo worked for [zulip](https://github.com/zulip/zulip) when i was randomly reading about their architecture. So, i duckduckgoed(:D) and found this article: [https://reminiscential.wordpress.com/2012/04/07/realtime-notification-delivery-using-rabbitmq-tornado-and-websocket/](https://reminiscential.wordpress.com/2012/04/07/realtime-notification-delivery-using-rabbitmq-tornado-and-websocket/)   . It turns out he also had a similar doubt and he got a solution.

[Pika](https://github.com/pika/pika) library comes with a tornado adapter named [TornadoConnection](https://github.com/pika/pika/blob/master/pika/adapters/tornado_connection.py). This makes running the rabbitmq consumer loop inside the tornado IOloop itself. The code for tornado connection is fairly simple. As the code given in the blog wasn't fully functional, i had to contact the source code of pika a couple of times.

Each websocket connection in tornado gets a unique [WebSocketHandler](https://github.com/tornadoweb/tornado/blob/master/tornado/websocket.py#L60) object and these are not directly accessible from the tornado application object. But, the reverse is true. Each websocket handler has access to the application object. So, using TorandoConnection, we tie up one pika consumer to the tornado application object.

**server.py**

```python

def main():
    ''' The main method to run the tornado application '''

    io_loop = tornado.ioloop.IOLoop.instance()

    pc = PikaConsumer(io_loop)

    application.pc = pc
    application.pc.connect()
    application.listen(8080)
    io_loop.start()

```

**consumer.py**

```python

class PikaConsumer(object):
    ''' The pika client the tornado will be part of '''

    def __init__(self, io_loop):
        print 'PikaClient: __init__'
        self.io_loop = io_loop
        self.connected = False
        self.connecting = False
        self.connection = None
        self.channel = None
        self.event_listeners = {}

    def connect(self):
        ''' Connect to the broker '''
        if self.connecting:
           print 'PikaClient: Already connecting to RabbitMQ'
           return

        print 'PikaClient: Connecting to RabbitMQ'
        self.connecting = True

        cred = pika.PlainCredentials('someuser', 'somepass')
        param = pika.ConnectionParameters(
            host='localhost',
            port=5672,
            virtual_host='somevhost',
            credentials=cred)
        self.connection = TornadoConnection(
                    param,
                    on_open_callback=self.on_connected)
        self.connection.add_on_close_callback(self.on_closed)

    def on_connected(self, connection):
        print 'PikaClient: connected to RabbitMQ'
        self.connected = True
        self.connection = connection
        self.connection.channel(self.on_channel_open)

    def on_channel_open(self, channel):
        print 'PikaClient: Channel open, Declaring exchange'
        self.channel = channel
        # declare exchanges, which in turn, declare
        # queues, and bind exchange to queues
        self.channel.exchange_declare(
              exchange='someexchange',
              type='topic')
        self.channel.queue_declare(self.on_queue_declare, exclusive=True)

    def on_queue_declare(self, result):
        queue_name = result.method.queue
        self.channel.queue_bind(
        self.on_queue_bind,
        exchange='someexchange',
        queue=queue_name,
        routing_key='commands.*')
        self.channel.basic_consume(self.on_message)

    def on_queue_bind(self, is_ok):
        print 'PikaClient: Exchanges and queue created/joined'

    def on_closed(self, connection):
        print 'PikaClient: rabbit connection closed'
        self.io_loop.stop()

    def on_message(self, channel, method, header, body):
        print 'PikaClient: message received: %s' % body
        self.notify_listeners(body)
        # important, since rmq needs to know that this msg is received by the
        # consumer. Otherwise, it will be overwhelmed
        channel.basic_ack(delivery_tag=method.delivery_tag)

    def notify_listeners(self, event_obj):
        # do whatever you wish
        pass

    def add_event_listener(self, listener):
        # listener.id is the box id now
        self.event_listeners[listener.id] = {
                'id': listener.id, 'obj': listener}
        print 'PikaClient: listener %s added' % repr(listener)

    def remove_event_listener(self, listener):
        try:
            del self.event_listeners[listener.id]
            print 'PikaClient: listener %s removed' % repr(listener)
        except KeyError:
            pass

    def event_listener(self, some_id):
        ''' Gives the socket object with the given some_id '''

        tmp_obj = self.event_listeners.get(some_id)
        if tmp_obj is not None:
            return tmp_obj['obj']
        return None

```

That's it. In your *WebSocketHandler* objects, you can access the consumer via: *self.application.pc*

Although, this is working fine for me right now but, i am not fully satisfied with this. At present each connection is listening to a single queue because in rabbitmq one consumer cannot listen to multiple queues.
