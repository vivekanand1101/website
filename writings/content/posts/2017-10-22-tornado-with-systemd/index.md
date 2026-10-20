---
title: "Tornado with systemd"
date: 2017-10-22
draft: true
archived: true
categories: 
  - "tech"
originalUrl: "https://vivekanandxyz.wordpress.com/2017/10/22/tornado-with-systemd/"
---

Unlike Django or Flask, tornado is not WSGI based. It also ships with it's own HTTP server and running the tornado server in production is not very much different from what you do while running it while developing. You may want to run the server in background though.

The systemd config file for tornado server that i am currently using is:

*[Unit]*
*Description=Tornado server service file*
*After=rabbitmq-server.target*

*[Service]*
*ExecStart=/usr/bin/python /path/to/tornado/server/main/method.py*
*Restart=on-abort*

*[Install]*
*WantedBy=multi-user.target*

For my use case, it should start after rabbitmq-server has started. After putting this script in */etc/systemd/system/* , you can start the server by:

*sudo systemctl start servicename.service*

It's status can be checked using:

*sudo systemctl status servicename.service*

For people with trust issues, you can use curl or visit the site itself to reconfirm. In my case, the tornado server was a websocket server and not http. So, i had to put some additional parameters with curl which i got from [here](https://gist.github.com/htp/fbce19069187ec1cc486b594104f01d0).

*➜ curl --include \*
* --no-buffer \*
* --header "Connection: Upgrade" \*
* --header "Upgrade: websocket" \*
* --header "Host: http://127.0.0.1:8080" \*
* --header "Origin: http://127.0.0.1:8080" \*
* --header "Sec-WebSocket-Key: SGVsbG8sIHdvcmxkIQ==" \*
* --header "Sec-WebSocket-Version: 13" \*
*http://127.0.0.1:8080/ws*

That's it.
