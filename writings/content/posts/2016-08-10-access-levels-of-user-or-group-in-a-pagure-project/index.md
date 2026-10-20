---
title: "Access levels of user/group in a pagure project"
date: 2016-08-10
categories: 
  - "fedora"
  - "tech"
originalUrl: "https://vivekanandxyz.wordpress.com/2016/08/10/access-levels-of-user-or-group-in-a-pagure-project/"
---

Currently in [pagure](https://pagure.io/), we have only two access levels in a project - either you have no access or admin access. There have been a few discussions of more levels of access - [#829](https://pagure.io/pagure/issue/829),  [#792](https://pagure.io/pagure/issue/792)

With the new changes, there will be four different levels of access -
- **None**: As the name suggests, no special power. Just a normal user.
	- **Ticket**: Edit the metadata of issues which includes tagging, assigning and changing the status of the issue. They** can't** delete or edit the issue itself.
	- **Commit**: All the access an admin of the project has except access to settings of the project.
	- **Admin**: He is the boss of the project.
As you can see, the levels are hierarchical in nature. The committers have all the access a user with ticket access has and similarly, the admin has all the access a committer has plus, some other accesses.

Ticket access is sort of "entry" level access to the project. They can play with the metadata of the issue and that's it. The committers can merge/close a pull request, can commit to the project repository directly, edit/remove issues/comments. Basically, they can do anything in the project but touch the settings. Since, the admins are the only ones with access to settings, they are the only ones who can add/remove a user/group from a project or update their accesses.

In pagure, groups are dealt in a similar way as a user is. So, they too can have all the mentioned access levels. If you provide a group with some access in a project, all the users in the group will automatically get that access. In cases when a user already has some access "a", and is also present in a group with some other access "b", he gets greater level of access out of "a" and "b".

**Implementation (in short)**

We already have admin access level in pagure so adding two more levels wasn't a big deal. It has been implemented in a similar way. Here are few of the points:
- Introduction of a new table: *access_levels* in the pagure db and foreign keys of the same in *user_projects* and *projects_groups* tables.
	- *project.users *now returns the list of users with at least ticket access , earlier it returned the list of users with admin access. Similar is the case with *project.groups . *Similar relations:* project.admins, project.committers, project.admin_groups, project.committer_groups.*
	- Two functions: *is_repo_committer * and *is_repo_user * to check for the rights of the user on the project. *is_repo_admin* was already there.
	- Update code to allow *RW+* right for committers in *gitolite *file.
	- Changes in the conditional statements across the pagure code.
Pull request related to this is [here](https://pagure.io/pagure/pull-request/1177). Tests and docs haven't been updated yet.
