---
title: "Detecting and Automatically Mounting Pendrive on Raspbian Stretch Lite"
date: 2017-12-29
draft: true
archived: true
categories: 
  - "tech"
originalUrl: "https://vivekanandxyz.wordpress.com/2017/12/29/detecting-and-automatically-mounting-pendrive-on-raspbian-stretch-lite/"
---

In the lite version of Raspbian Stretch, i didn't expect that i would have to manually mount the pendrive. I had a use case in which mounting it automatically was a necessity and thus i came across [usbmount.](https://github.com/rbrito/usbmount)

You can install it in raspbian using apt-get.
> sudo apt-get install usbmount
Usbmount gives a lot of configuration options in */etc/usbmount/usbmount.conf*  but, for my use case the default were good enough.

This wasn't enough though. It wasn't detecting the usb stick. And, on searching i found out that i wasn't the only one who was having [this problem](https://github.com/rbrito/usbmount/issues/2). For the usbmount to work in raspbian stretch, you will have to manually edit systemd file for udevd located in */lib/systemd/system/systemd-udevd.service *and change *MountFlags=slave* to *MountFlags=shared* as someone commented [here](https://github.com/rbrito/usbmount/issues/2#issuecomment-330739503).
