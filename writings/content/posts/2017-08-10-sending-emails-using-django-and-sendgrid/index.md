---
title: "Sending Emails using Django and Sendgrid"
date: 2017-08-10
draft: true
archived: true
categories: 
  - "tech"
originalUrl: "https://vivekanandxyz.wordpress.com/2017/08/10/sending-emails-using-django-and-sendgrid/"
---

Recently, i setup a django app which uses  [sendgrid](http://sendgrid.com) to send emails. I will go through the steps in this short blog.
- Register at [sendgrid](http://sendgrid.com)
	- Choose SMTP for sending emails
	- Get an API key. The last step will redirect you to this. This key will also be your password. The username that they gave me was *apikey* so, i guess this remains same for everyone.
	- Configure your django settings to this:
*EMAIL_HOST_USER = '' *
*EMAIL_HOST = 'smtp.sendgrid.net' *
*EMAIL_HOST_PASSWORD = ''*
*EMAIL_PORT = 587 *
*EMAIL_USE_TLS = True*
* EMAIL_BACKEND = 'django.core.mail.backends.smtp.EmailBackend'*  (this is the default value of EMAIL_BACKEND btw)
	- Use *django.core.mail.send_mail* for sending emails now
