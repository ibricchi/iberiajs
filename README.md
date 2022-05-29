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

IberiaJS has 2 features to dynamically format text commands **$ ... $** and variables **# ... #**.

### Commands

The following commands are currently supported:
* if
* for
* foreach
* md

Commands take the form:


```
$[name of command] [list of parameters]? [list of modifiers]?$

body

$end$ 
```

eg.

```
$if #shopping_list var at("length")#$
$md$

# Shopping List

$foreach item shopping_list alphabetical$
* #item var capitalize#
$end$

$end$		

$end$
```

All command scope variables to their body by default unless the "unscoped" modifier is listed in it's list of modifiers.

#### if
The if command takes the following form
```
$if [condition variable] [modifiers list]?$

body of loop

$end$
```

The condition variable will be evaluated using default js truthiness. If the expression is evaluated true the body will be included, otherwise it will be ignored.

Additional Modfiers:
* "not" will only evaluate the body if false

#### for
The for loop takes the following form:

```
$for [variable declarations] [comparison variable] [comparison type] [comparison value] [variable updates] [modifiers]?$

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

Additional modifiers
* reversed
* alphabetical
* alphareversed
* increasing
* decreasing
* randomized

Sorts the array items appropriately and are applied in order as they appear.

#### define

The define command takes the following form:

```
$define [variable name] [type]? [modifiers]?$
body of define
$end$
```

The body will be evaluated and the result will be treated as a string by default, but an optional type can be specified to overrule that. By default the after any modifiers, the body of a string will have the whitespace at begining and end trimmed.

Types are:
* string
* number

More types are planned to be added later on.

Additional modifiers
* "trim" removes white space at the start and end of the string imediately, only applies to string type
* "notrim" prevents the atuomatic trimming after processing for strings, only applies to string type

#### md

The md command takes the following form:

```
$md [modifiers]?$
body of md
$
```

The body is formatted as an md file. This is currently being parsed by the [marked](https://github.com/markedjs/marked) project. Although the plan is to transition to a hand written parser later on.

By default the body is procesed as an ib script allowing for dynamic modification of md file, however, this can be turned off using modifiers.

Additional modifiers:
* "pure" turns of iberia pre-processing for the body of the command

### Variables

Variable follow the following form:

```
#[variable name/value] [type]? [modifiers]?#
```

Variable might not be a great name for these as they are much more complex than that.

The type of a variable by default is "var" unless otherwise specified. In this case the variable name will be used to check the current context and return the value in it.

Other types directly use the variable value direclty, and parse acordingly. Currently only "var", "number", and "string" can be specified.

Variable names and values can use escaped spaces "\ " to include spaces if needed.

Each modifier is applied one at a time and may only work on certain types.

String modifiers:
* load([format])
	This will use the value of the string as an absolute path to fetch a file. This will then be parsed depending on the format. Currently the formats supported are:
	* "ib" Formated as an ibera formated file
	* "md" Formatted as an md file with ib formatting
	* "pure md" Formatted as a pure md file
	* "json" Formatted as a json file and converted into an object
	* "text" Just loads the text value directly
* parse([format])
	This will parse the given text value and has support for the same formats the load modifier, with the execption of text, which would do nothing.
* uppercase
	This will convert all text to upercase
* lowercase
	This will convert all text to lowercase
* captitalize
	This will capitalize all words
* capitalize-first
	This will capitalize only the first word
* trim
	This will remove leading and traling white space

Array/Object modifiers
* at(index)
	This will read the value of the index for the given array or object

Function modifiers:
* call
	This will call the function directly. Currently only supports 0 arity functions, but in the future will support function parameters.

## Road Map

In future I would like to add some of the following features:

* Better error messages and handling, with line number and file name.
* More control flow commands like "switch"