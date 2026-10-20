---
title: "Using C function from Python"
date: 2017-09-17
draft: true
archived: true
categories: 
  - "tech"
originalUrl: "https://vivekanandxyz.wordpress.com/2017/09/17/using-c-function-from-python/"
---

c*types* is a python library which allows using C data types, functions from a python script. It's in the standard python library. To use C functions using ctypes, you will need to compile the C code and create a shared library.

**add.c**

```cpp

#include 

int add_two_numbers(int num1, int num2) {
    return num1 + num2;
}

```

I will be using a very simple C function in this case which adds two given numbers

Now compile this file using:
* gcc -fPIC -shared -o libadd2nums.so add.c*

This will create a shared library named libadd2nums.so which, for now, contains only one function.

**add.py**

```python

# coding=utf-8

import ctypes

_add = ctypes.CDLL('/home/vivek/ctypestuts/libadd2nums.so')
_add.add_two_numbers.argtypes = (ctypes.c_int, ctypes.c_int)

def add_two_numbers(num1, num2):
   ''' Adds two numbers '''

   return _add.add_two_numbers(ctypes.c_int(num1), ctypes.c_int(num2))

```

I am using fedora 26. If you are using Windows, you will need to use *ctypes.WinDLL.*

*_add* here, is the shared library and we can access the C function using dot(.) .

**main.py**

```python

# coding=utf-8

import add

num1 = int(raw_input(&quot;Enter num1: &quot;))
num2 = int(raw_input(&quot;Enter num2: &quot;))
print add.add_two_numbers(num1, num2)

```

That's it.
