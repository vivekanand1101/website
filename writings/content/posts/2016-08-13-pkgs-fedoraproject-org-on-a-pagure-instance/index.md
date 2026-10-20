---
title: "pkgs.fedoraproject.org on a pagure instance"
date: 2016-08-13
categories: 
  - "fedora"
  - "tech"
originalUrl: "https://vivekanandxyz.wordpress.com/2016/08/13/pkgs-fedoraproject-org-on-a-pagure-instance/"
---

pkgs.fedoraproject.org currently has more than 18k git repositories and it's relying on cgit which is not capable of git collaboration. On the other hand, we have pagure which is a git collaboration tool and it's live on [pagure.io](https://pagure.io). As part of my Google Summer of Code project, i was supposed to prepare script and adjust pagure so that we can have pkgs.fp.org on a pagure instance.

For those who are not familiar with pagure, it's a free and open source git collaboration tool written on top of pygit2 by [pingou](http://blog.pingoured.fr/). It has a similar workflow as [Github](http://github.com) . One can fork a project, make changes and ask to merge the changes to the main project by creating a pull request. [pagure.io](http://pagure.io) already has more than 250 projects hosted on it and it's increasing everyday. Feel free to play with pagure on [stg.pagure.io](http://stg.pagure.io).

The idea is, we will make pkgs.fedoraproject.org a pagure instance. With this change, it will be easier for anybody to contribute to any of the git rpms hosted on pkgs.fp.org . This is the major reason for the shift. Currently, only the rpm maintainers can make changes to the repository. But, once we have these rpms on a pagure instance, anybody with a [FAS](https://admin.fedoraproject.org/accounts/) account can fork the project and make a pull request.

Here are a few points which makes pagure adaptable for pkgs.fp.org :
- Turn on/off user management: Since, the acls for the git repositories come from pkgdb, user management should be turned off on the instance level.
	- Turn on/off Issue Tracker: The git rpms are not exactly projects, so it's turned off at the instance level as well.
	- Turn on/off project creation: The git rpms need approval for creation of a project, thus a user shouldn't be able to create a project.
	- Pseudo namespace: Pagure doesn't have namespaces for a project (although, forks have). Thus, pseudo namespace was introduced. We can have a list of namespaces allowed for an instance.
Honestly speaking, almost all the above mentioned work was already done. After this, we just needed to adjust the script which currently gets acls from pkgdb so that it updates pagure database as well.

The work is almost complete and the shift should not take long once pingou returns from his vacation.

For any further query, you can ping me on #fedora-apps (nick: vivek_)

Happy coding,

Vivek
