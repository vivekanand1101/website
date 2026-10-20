---
title: "Django with uwsgi and nginx on fedora"
date: 2017-08-08
draft: true
archived: true
categories: 
  - "tech"
originalUrl: "https://vivekanandxyz.wordpress.com/2017/08/08/django-with-uwsgi-and-nginx-on-fedora/"
---

Today, i deployed a [django](https://github.com/django/django) project using [uwsgi ](https://github.com/unbit/uwsgi)and [nginx ](https://github.com/nginx/nginx)on a fedora 26 instance on *AWS*. I will talk about the same here.

I had used [gunicorn](https://github.com/benoitc/gunicorn) in the past but never uwsgi. Getting started with gunicorn was a little bit easier for me than uwsgi primarily because i didn't know i had to install *uwsgi-plugin-python* package to use uwsgi with django. This took me a while because, there were no errors. There was a "no app could be loaded" problem but, on internet most of this kind of error is for [flask](https://github.com/pallets/flask). Flask exposes it's application object as app and uwsgi looks to load application which it fails to find.

The steps are:
- Install dependencies and the project itself:
- *sudo dnf install uwsgi uwsgi-plugin-python nginx*

- Create a configuration file for uwsgi: *uwsgi.ini*
	- Change nginx config to pass on to uwsgi for incoming requests on */ethcld/* (the mount point that i used)
 

Here is my uwsgi file:

*[uwsgi]*
*chdir = /home/fedora/ethcld*
*plugin = python*
*# Django's wsgi file*
*# module = ethereal.wsgi:application*
*mount = /ethcld=ethereal.wsgi:application*
*manage-script-name = True*
*master = True*
*# maximum number of worker processes*
*processes = 4*
*# Threads per process*
*threads = 2*
*socket = 127.0.0.1:8001*
*# clear environment on exit*
*vacuum = true*

uwsgi asks for the directory of the project. In my case, it was */home/fedora/ethcld/*. *Mount* is optional, if you want to run the application under some namespace, you will have to use mount. Also, if mount is getting used, you should not need *module*.

Manage Script name (manage-script-name)is important while mounting otherwise you will get a bunch of 404s. Usually, the request comes for something like: *GET /username/ * but, without *manage-script-name* option, nginx will not map* /username/* to */ethcld/username.*

For socket, i could have used unix socket instead of port one. But, somehow i settled for port.

On the nginx side, i did the following changes:

* http {*

*       include /etc/nginx/mime.types;*

*       server {*

*                location ^~/static/ {*
*                       autoindex on;*
*                       alias /opt/ethcld/static/;*
*                }*

*                location ^~ /ethcld {*
*                        include uwsgi_params;*
*                        uwsgi_pass 127.0.0.1:8001;*
*                }*

*         }*

*}*

Nginx supports uwsgi protocol by default, so options are already there, we just need to call them. For serving static files, for django, it is recommended that we do:
- *python manage.py collectstatic*
This will copy (by default) all the static files in the django app to the location specified in *STATIC_ROOT* in settings. From there we can serve the static files. There are possible optimizations that can be done like gzip. But, i did this for testing only.

You need to include *mime.types*, otherwise browsers will keep rejecting files. By default, the mime type is *'text/plain'*.
