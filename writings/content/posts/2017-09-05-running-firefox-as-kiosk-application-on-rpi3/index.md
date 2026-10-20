---
title: "Running Firefox as kiosk application on RPi3"
date: 2017-09-05
draft: true
archived: true
categories: 
  - "tech"
originalUrl: "https://vivekanandxyz.wordpress.com/2017/09/05/running-firefox-as-kiosk-application-on-rpi3/"
---

At my day job, i had to run firefox as a kiosk application on RPi3. In this blog post, i will note down the steps that i did so that i or my team members can refer to it when needed.

I have not used any display manager or Desktop Environment but had to use matchbox-window-manager to make firefox run on full screen.
- *sudo apt-get install vim* (this is just for me, i can't help it)
	- *sudo apt-get install xorg xutils matchbox-window-manager *
	- *sudo apt-get install iceweasel* (this is firefox :p)
	- *sudo raspi-config*
- Go to boot options and setup auto login for user pi
	- Change the keyboard layout if you wish to
- As a sudo user, do the following steps:
- *cp -r /home/pi  /opt/*
	- *cd /opt/pi*
	- *chmod -R a+r .*
	- *touch .xsessionrc*
	- *chmod a+x .xsessionrc*
- Open .xsessionrc as a sudo user and put the following lines there:
- *xset s off # no screen saver*
*xset -dpms  # disable some power consumption thingy*
*xset s noblank # don't blank the rpi screen*
*matchbox-window-manager &*
*while true; do*
*  firefox --url http://127.0.0.1*
*done*
- Copy *.xsessionrc* file to */home/pi/ *
- *cp .xsessionrc /home/pi*
- Configure *.bash_profile* to start X server when user logs in:
- *if [ -z "$DISPLAY" ] && [ -n "$XDG_VTNR" ] && [ "$XDG_VTNR" -eq 1 ]; then*
* exec startx*
*fi*
- Install an extension in firefox to apply kiosk mode. The first extension that comes up when you search kiosk in addons works fine
The blog post that helped most in coming up this setup was: [http://www.alandmoore.com/blog/2011/11/05/creating-a-kiosk-with-linux-and-x11-2011-edition/](http://www.alandmoore.com/blog/2011/11/05/creating-a-kiosk-with-linux-and-x11-2011-edition/)
