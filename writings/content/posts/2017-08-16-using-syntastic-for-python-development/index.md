---
title: "Using Syntastic for Python development"
date: 2017-08-16
draft: true
archived: true
categories: 
  - "tech"
originalUrl: "https://vivekanandxyz.wordpress.com/2017/08/16/using-syntastic-for-python-development/"
---

I use [Synstastic plugin](https://github.com/vim-syntastic/syntastic) of vim for syntax checking in vim. Syntastic offers syntax checking for a LOT of languages. But, there is a problem that i had been facing with it. For a file with larger than 4k lines, it takes a lot of time to check the syntax and it used to happen every time you save the file. Syntax checking on write operation is the default behavior.

So, i did some changes in my .vimrc so that i could still use Syntastic for larger files. Do note that syntastic checking still takes a long time but, i have configured it to be called whenever i want to rather than on every write operation or opening of file.

*" show list of errors and warnings on the current file *
* nmap e :Errors *
* " Whether to perform syntastic checking on opening of file *
* " This made it very slow on open, so don't *
* let g:syntastic_check_on_open = 0 *
* " Don't check every time i save the file *
* " I will call you when i need you *
* let g:syntastic_check_on_wq = 0 *
* " By default, keep syntastic in passive mode *
* let g:syntastic_mode_map = { 'mode': 'passive' } *
* " Use :Sc to perform syntastic check *
* :command Sc :SyntasticCheck *
* " Check pylint for python *
* let g:syntastic_python_checkers = ['pylint'] *
* " For jsx - React and React native *
* let g:syntastic_javascript_checkers = ['eslint']*

This change made opening of a larger python file ~25s (yes, seconds) faster. It still takes a lot of time for syntax checking though. I will have to find out why and if i could do anything about it. I don't want to leave out this plugin because it offers so much. I could simply use [Python-mode](https://github.com/python-mode/python-mode) for python syntax checking but, what about the rest of the languages which i am going to use.
