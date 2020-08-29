[![Gitpod ready-to-code](https://img.shields.io/badge/Gitpod-ready--to--code-blue?logo=gitpod)](https://gitpod.io/#https://github.com/IBricchi/iberiajs)

# iberiaJS

![iberiaJS logo](./logo/logo.png)

This is a simple HTML pre-processor written from scratch in JS. The project started off as a helper tool for building my personal website ibricchi.com, however as it expanded I thought I would take it up as a full project and build it out properly.

## JS

To run iberiaJS you must first import the iberia.js file into your html document. Once done the following command will load and parse an Iberia formatted html file.

```
ib.insert_ib_html([file path], [target], [variables]);
```

File path is a string with a relative or absolute path to the file being loaded.

Target is the target destination of the destination of the loaded file. This can be a tag, an id or a class.

Variables is a map of variables to be passed int to the iberia html parser.

For loading plain html or text files the following command can be used instead:
```
ib.insert_file([file path], [target]);
```
To simply read a file and have the data returned as a string:
```
ib.get_file([file path]);
```
To read and format an Iberia formatted html file and have the value be returned as a string:
```
ib.get_ib_html([file path], [variables]);
```
To insert text into a specific target location:
```
ib.insert_text([target], [text]);
```
Where text is the string that will be inserted into the target.


## Iberia formatting

IberiaJS has 2 features added on top of html commands **$ ... $** and variables **# ... #**.

### Commands

The following commands are currently supported:
* for
* foreach
* define
* load
* md

#### for
The for loop takes the following form:

```
$for [variable declarations] [comparison variable] [comparison type] [comparison value] [variable updates]$

body of loop

$end$
```

Variable declarations are a series of comma separated strings referring to variables. These will by default be initialised to 0, unless otherwise specified with an = sign. There can be no spaces between the variables.

Some examples:

	i,j,k or i,j=1,k or these=1,are=-1,variables=2

Comparison variable is the variable used in the comparison for the for loop. This is a single variable, and does not have to be one specified in the loop, as long as it exists in some way.

The comparison type can be one of:
* <
* <=
* \>
* \>=
* ==
* !=

The comparison variable can be either a number, or a variable surrounded by #'s.

The variable updates are once again a set of comma separated commands of the form [variable name]+=[value or variable name surrounded by #'s].

All text inside the body of the for loop is assumed to be ib formatted html, and thus nested for loops can exist. For loops create a variable scope so variables defined within or by the for loop cannot be accessed outside of the loop.

#### foreach

The foreach loop is simpler than the for loop:

```
$foreach [item variable] [array variable] [modifier]?$

body of loop

$end$
```

The item variable is the name of the variable that will be used to hold each item in the array.

The array variable is the array that contains all the items being looped through.

There is an optional modifier term that if left blank does nothing. If it is set to one of the following:

* reversed
* alphabetical
* alphareverse
* increasing
* decreasing
* random

Sorts the array items appropriately.

#### define

The define command takes the following form:

```
$define [variable name]
[body of define]
$
```

The variable name must follow the naming conventions specified later in the documentation.

The body can be any text or numeric value, can include any form of white-space, and will retain all of the information passed to it. This must be preceded by a new line after the variable name. A final new line before  and ended with a new line before the final "\$". To use "\$" in the body, the "\$" must be escaped "\\\$".

#### load

The load command takes the form:

```
$load [path] [load type]?$
```

Currently the path must be an absolute path, but in the future the idea is to add relative path support. This path can be a variable string, described later in the documentation.

An optional load type parameter is in place. If left empty the loaded file is inserted as plain text, this would be used if plain html, or simple text files want to be inserted into the file. The other parameters available are:

* ib. This processes the text as iberia formatted html, and processes it accordingly.
* ib_unscoped. This does the same as above, however it does not create an individual scope for the loaded file. This means variables defined within that file are available on the same scope as the load command, instead of only within the file loaded.
* md. Any text is formatted as md file. This is currently being parsed by the [marked](https://github.com/markedjs/marked) project. Although the plan is to transition to a hand written parser later on.

#### md

Md is similar to the define command:

```
$md
[body of md]
$
```

The body of the md, must be preceded and followed by new lines, and everything between the new lines is captured as text, this includes all white-space. to use a "\$" in the body it must be escaped "\\\$".

The body is formatted as an md file. This is currently being parsed by the [marked](https://github.com/markedjs/marked) project. Although the plan is to transition to a hand written parser later on.

### Variables

Simple variable follow the following form:

```
#[variable name]#
```

Variable names can contain any characters available except for "#" "\$" and the combination "->". It must also be one continuous string with no spaces, and cannot begin with a number or "-" sign.

This naming convention is still subject to change as the program is developing.

However the "->" sign can be used to add modifiers to the variable.

```
#[variable name]->[modifier]#
```
The entire variable command cannot contain any spaces.

Modifiers avaiable at the moment are:

* ib. This processes the variable value as Iberia formatted html
* ib_unscoped. This does the same as above, however it does not create an individual scope for the loaded file. This means variables defined within the variables value are available on the same scope as the variable command, instead of only within the file loaded.
* md. This causes the variable value to be formatted as an md file. This is currently being parsed by the [marked](https://github.com/markedjs/marked) project. Although the plan is to transition to a hand written parser later on.
* get/at/array. These are used to obtain specific array values at a given index, this follows the form:
	```
	#[variable name]->[get or at or array]->[index]#
	```
	An index can be either an integer, or a variable name.

#### variable strings

Some command accept variable strings as one of their inputs. A variable string is a string which at some-point contains a variable nested within it. These strings can have no spaces, so either "%20" must be used if for path, or "&\#32" must be used for html formatted text. Future versions will support escaped spaces.

Variables nested in a string currently do not support modifiers, but still must be surrounded in #'s. If a # is meant to be included in the string the it must be escaped "\\#".

## Road Map

In future I would like to add some of the following features:

* Better error messages and handling, with line number and file name.
	* Especially add variable name checking to ensure variable names are followed.
* More control flow command "if" and "switch"
* ib_md, options which would allow using Iberia commands and variables withing md files.
* Improve escaping characters during parsing.
* Add variables with modifiers to variable strings.