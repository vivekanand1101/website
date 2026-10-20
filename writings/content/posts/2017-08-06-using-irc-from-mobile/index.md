---
title: "Using IRC from Mobile"
date: 2017-08-06
draft: true
archived: true
categories: 
  - "tech"
originalUrl: "https://vivekanandxyz.wordpress.com/2017/08/06/using-irc-from-mobile/"
---

In this blog post, i will talk about how i use IRC from mobile.

I have been using [weechat](https://weechat.org) as my irc client for about a year now and i am happy with it. Generally, i used to open weechat in one tmux session and project (or projects) in other tmux sessions in my machine and stay on IRC while working. This serves well except for the fact that when you are not connected with internet, nobody on irc can leave a message for you.

I didn't know about weechat's [relay feature](https://weechat.org/files/doc/devel/weechat_relay_protocol.en.html) until very recently when [maxking](https://asynchronous.in/) was talking about this in #dgplug. In this feature, weechat listens to client connections to a specified port that allows two way communication between connected clients and weechat. The clients can be any device with internet access. The only thing left then for this setup to work was an android app. There were two options, [glowing bear](https://github.com/glowing-bear/glowing-bear-cordova) and [weechat-android](https://github.com/ubergeek42/weechat-android). The former didn't support ssl so it was out of picture.

A few weeks ago, i got a free tier fedora 26 instance on *AWS.* I had to use this for testing other applications that i was working on. Also, AWS doesn't allow(atleast for my instance) *HTTPS* connections for ports other than 443. I wanted to use ssl and that too for more than one application and thus decided using *nginx* as reverse proxy.

Here are the list of things that i did:
- Installed nginx, tmux and weechat on aws instance.
	- Created self-signed certificate and pointed nginx to that.
	- Configure weechat to relay on port 9001 and configure nginx for websocket connections on 443 and proxy it to 9001.
	- Use weechat-android to connect to the relay using websocket(ssl) as connection type.
I used tmux so that i could ssh into the aws instance and join the tmux session. This is where the client-server architecture of tmux helped. I couldn't use [let's encrypt](https://letsencrypt.org/) or [ACM](https://aws.amazon.com/certificate-manager/) for ssl certificate because i didn't have domain name for that public IP. Creating self-signed certificate is surprisingly easy and [this ](https://www.digitalocean.com/community/tutorials/how-to-create-a-self-signed-ssl-certificate-for-nginx-in-ubuntu-16-04)Digital Ocean blog helped.

I also use [urlserver.py](https://weechat.org/scripts/source/urlserver.py.html/) plugin for weechat which shortens url for you. It runs a small server on the system and provides redirects to the original link. With nginx, i am able to configure urlserver.py to run on one port and point nginx to that.

I am not fully happy with weechat-android though. Most of the time it works but, sometimes it disconnects right after connecting without saying anything. Other people have found this too [here](https://github.com/ubergeek42/weechat-android/issues/279). Atleast, people can drop any message for me now.
