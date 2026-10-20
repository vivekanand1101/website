---
title: "Django's transaction.on_commit"
date: 2018-12-18
categories: 
  - "tech"
originalUrl: "https://vivekanandxyz.wordpress.com/2018/12/18/djangos-transaction-on_commit/"
---

I am talking with Django 1.11 in mind. The concepts still apply to newer versions.

Django provides a method using which you can execute a particular function when you are sure that a particular entry has made to the database, that's transaction.on_commit.

There is also Django's Post save signal. Both have their use cases. The difference between the two is that on_commit is executed when Django finally commits to the database and it's only useful when you are inside a transaction. While, in case of post save signal, you are not even sure that the object you are currently saving will finally be committed to the database (if it's inside a transaction block). Post save has it's use case when you need to know the object which just got changed or got created since, you get boolean on whether it was updated or created and also the changed/created object itself.

How to work with transaction.on_commit?

When the code is running, you can register a function to be called, by calling

*transaction.on_commit(my_fancy_function_to_be_called_on_commit).*

Remember, you are trying to pass a function here and not the function's returned value. What happens here is, Django adds the* my_fancy_function_to_be_called_on_commit* to a list of functions which it calls when it finally commits the ongoing transaction. There are few small things here:
- Since the transactions can be nested, when does django finally execute these functions?Django executes them after it is no longer inside an atomic block (wrapped in a transaction). If there is no transaction block and you are trying to register the function, it won't get register rather get called instead. Here is the link to the source code:
[Registering and what happens on registering](https://github.com/django/django/blob/main/django/db/backends/base/base.py)
[Things happening while executing the registered functions](https://github.com/django/django/blob/main/django/db/backends/base/base.py)
	- How do i pass arguments to the above functions?This is actually a basic python issue. You can wrap your function which has arguments inside a lambda expression or a normal function.

transaction.on_commit(lambda: my_fancier_func_with_args(a, b))

 
	- From where do we get this "transaction"?By importing:
*from django.db import transaction*
