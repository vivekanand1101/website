---
title: "Setting up postgres for python development"
date: 2017-12-02
draft: true
archived: true
categories: 
  - "tech"
originalUrl: "https://vivekanandxyz.wordpress.com/2017/12/02/setting-up-postgres-for-python-development/"
---

Postgresql is my database of choice mainly because, almost (if not all) web applications in fedora infrastructure use postgres and i have been using the same. But, every time i use a fresh system, i face some issues with getting started. Almost all of them are for client authentication. This post is here in case it happens the same in future.
- Install the dependencies:
- sudo dnf install postgresql postgresql-devel postgresql-server postgresql-contrib
- Create a db user other than postgres:
- sudo -i
	- su - postgres
	- initdb
	- Start the database using command: pg_ctl -D /var/lib/pgsql/data -l logfile start
	- psql -U postgres
	- create database pagure;
	- create user pagure with password 'pagure';
	- grant all privileges on database pagure to pagure;
	- show hba_file;
	- Go to that file and change the auth mode to trust;
- If runs into: unregistered authentication agent for unix-process [https://techglimpse.com/solution-polkitd-postgresql-start-error/](https://techglimpse.com/solution-polkitd-postgresql-start-error/)
