---
title: "Detecting USB Insertion/Removal using Python"
date: 2018-01-03
categories: 
  - "tech"
originalUrl: "https://vivekanandxyz.wordpress.com/2018/01/03/detecting-usb-insertion-removal-using-python/"
---

In a previous post, i wrote about how [usbmount](https://github.com/rbrito/usbmount) can be used to automatically mount a USB on Raspbian. Today, i had to detect this mounting from python and show it in a web application that a usb has been inserted. I used [pyudev](https://github.com/pyudev/pyudev) for this and ran it in a different thread so that the main application thread is not affected by pyudev's monitor loop.

```python

class USBDetector():
    ''' Monitor udev for detection of usb '''

    def __init__(self):
        ''' Initiate the object '''
        thread = threading.Thread(target=self._work)
        thread.daemon = True
        thread.start()

    def _work(self):
        ''' Runs the actual loop to detect the events '''
        self.context = pyudev.Context()
        self.monitor = pyudev.Monitor.from_netlink(self.context)
        self.monitor.filter_by(subsystem='usb')
        # this is module level logger, can be ignored
        LOGGER.info("Starting to monitor for usb")
        self.monitor.start()
        for device in iter(self.monitor.poll, None):
            LOGGER.info("Got USB event: %s", device.action)
            if device.action == 'add':
                # some function to run on insertion of usb
                self.on_created()
            else:
                # some function to run on removal of usb
                self.on_deleted()

```

Since, usbmount mounts the filesystem of usb at some particular locations (/media/usb0-7), you can easily check for files in those folders and do whatever you wish to do with it.

Using the above code would be as easy as creating an object of *USBDetector* class.
