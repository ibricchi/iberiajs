import("./marked.min.js");

//#region ib_classes

const ib_token_types = {
    COMMAND: 0,
    TEXT: 1,
}

//#endregion

class ib {

    //#region api

    static async get_file(path) {
        if (typeof (fetch) != "undefined") {
            let response = await fetch(path);
            return response.text();
        }

        return new Promise(function (resolve) {
            let xhr = new XMLHttpRequest();
            xhr.open("GET", path, true);
            xhr.onload = function () {
                resolve(xhr.response);
            };
            xhr.onerror = function () {
                resolve(undefined);
                console.error("** An error occurred during the XMLHttpRequest");
            }
            xhr.send();
        })
    }

    static async get_ib_file(path, ctx) {
        let html = await this.get_file(path)
        html = await this.execute(html, ctx);
        return html;
    }

    static async insert_text(destination, text) {
        document.querySelector(destination).innerHTML = text;
    }

    static async insert_file(path, destination) {
        let html = await this.get_file(path);
        this.insert_text(destination, html);
    }

    static async insert_ib_file(path, destination, ctx) {
        let html = await this.get_ib_file(path, ctx);
        this.insert_text(destination, html);
    }

    //#endregion

    //#region helpers

    static scope_map(ctx) {
        var newMap = new Map();
        Object.keys(ctx).forEach(key => {
            newMap[key] = ctx[key];
        })
        return newMap;
    }

    static is_end_token(token) {
        return token && token.type == ib_token_types.COMMAND && token.command == "end";
    }

    static var_string(str, ctx) {
        let newString = [];
        for (let i = 0; i < str.length; i++) {
            if (i + 1 < str.length && str[i] == "\\" && str[i + 1] == "#") {
                newString.push("#");
                i++;
            }
            else if (str[i] == "#") {
                let start = i;
                let end = i + 1;
                while (end < str.length && str[end] != "#") {
                    if (end + 1 < str.length && str[end] == "\\" && str[end + 1] == "#") {
                        str = str.slice(0, end) + str.slice(end + 1);
                        end++;
                    }
                    end++;
                }

                i = end;

                let name = str.slice(start + 1, end);
                let value = this.direct_var(name, ctx);
                newString.push(ctx[name]);
            }
            else {
                newString.push(str[i]);
            }
        }
        return newString.join("");
    }

    static contains(haystack, needle) {
        if (!(haystack instanceof Array)) {
            haystack = Object.keys(haystack);
        }

        for(let val of haystack) {
            if(val instanceof RegExp) {
                if(val.test(needle)) {
                    val.lastIndex = 0;
                    return true;
                }
                val.lastIndex = 0;
            }
            else if(val == needle) {
                return true;
            }
        }

        return false;
    }

    static contains_or_warn(arr, obj, msg, def = null) {
        if (this.contains(arr, obj)) {
            return arr[obj];
        }
        else {
            console.warn(msg);
            return def;
        }
    }

    static validate_params(command, parameters, min, max, allowed_modifiers = []) {
        let length = parameters.length;
        if (min == max && length != min) {
            if (length < min) {
                console.warn(`${command[0].toUpperCase()}${command.slice(1)} requires exactly ${min} parameters. Command block will be ignored.`);
                return [false, [], []];
            }
            else if (allowed_modifiers == []) {
                console.warn(`${command[0].toUpperCase()}${command.slice(1)} requires exactly ${min} parameters. Extra parameters will be ignored.`);
                return [true, [parameters.slice(0, max)], []];
            }
        }
        if (length < min) {
            console.warn(`${command[0].toUpperCase()}${command.slice(1)} requires at least ${min} parameters. Command block will be ignored.`);
            return [false, [], []];
        }
        if (allowed_modifiers == [] && length > max) {
            console.warn(`${command[0].toUpperCase()}${command.slice(1)} allows at most ${max} parameters. Extra parameters will be ignored.`);
            return [true, [parameters.slice(0, max)], parameters];
        }
        if (allowed_modifiers != [] && length > max) {
            let params = parameters.slice(0, max);
            let modifiers = [];
            for (let i = max; i < length; i++) {
                let param = parameters[i];
                if (!this.contains(allowed_modifiers, param)) {
                    console.warn(`${command[0].toUpperCase()}${command.slice(1)} does not allow modifier ${param}. Modifier will be ignored.`);
                }
                else {
                    modifiers.push(param);
                }
            }
            return [true, params, modifiers];
        }

        return [true, parameters, []];
    }

    static async asyncStringReplace(str, regex, aReplacer) {
        const substrs = [];
        let match;
        let i = 0;
        while ((match = regex.exec(str)) !== null) {
            // put non matching string
            substrs.push(str.slice(i, match.index));
            // call the async replacer function with the matched array spreaded
            substrs.push(aReplacer(...match));
            i = regex.lastIndex;
        }
        // put the rest of str
        substrs.push(str.slice(i));
        // wait for aReplacer calls to finish and join them back into string
        return (await Promise.all(substrs)).join('');
    };


    static get_original_text_from_tokens(tokens) {
        let text = [];
        for (let i = 0; i < tokens.length; i++) {
            let token = tokens[i];
            if (token.inline) {
                // read line from first inline token and ignore the rest
                text.push(token.text);
                while (token.inline) { i++; }
            }
            else {
                if (token.type == ib_token_types.TEXT) {
                    text.push(token.text);
                }
                else {
                    text.push(token.text);
                    text.push(ib.get_original_text_from_tokens(token.body));
                    text.push(token.end_text);
                }
            }
        }
        return text.join("\n");
    }

    //#endregion

    //#region parse

    static parse(file) {
        let tokens = [];

        let lines = file.split("\n");

        lines.forEach(line => {
            tokens.push(...this.parse_line(line));
        })

        tokens = this.nest_commands(tokens)[0];

        return tokens;
    }

    static nest_commands(tokens, till_end = false) {
        let nested_tokens = [];
        let i = 0;
        // loop while there are tokens and in "till_end" flga is enabled untill and end token is found
        while (i < tokens.length && !(till_end && this.is_end_token(tokens[i]))) {
            let token = tokens[i];
            if (token.type == ib_token_types.COMMAND) {
                let body, end_text;
                [body, tokens, end_text] = this.nest_commands(tokens.slice(i + 1), true)
                token.body = body;
                token.end_text = end_text;
                nested_tokens.push(token);
                i = 0;
            }
            else {
                nested_tokens.push(token);
                i++;
            }
        }
        if (till_end && !this.is_end_token(tokens[i])) {
            console.warn("Found an unclosed command. Will automatically add close at end of file.");
        }

        return [nested_tokens, tokens.slice(i + (till_end ? 1 : 0)), till_end ? tokens[i].text : ""];

    }

    static parse_line(line) {
        // check if line starts with a $ representing a command
        if (line.trim()[0] == "$") {
            return this.parse_command(line);
        }
        // otherwise, return a text token
        else {
            return [{ type: ib_token_types.TEXT, text: line }];
        }
    }

    static parse_command(line) {
        // check type and correctness of command
        let command_regex = /^\$(.*)\$$/g;
        let inline_command_regex = /^\$(.*)\$(.*)\$(.*)\$$/g;

        // check if line is an inline command
        let inline_command_match = inline_command_regex.exec(line.trim());
        if (inline_command_match) {
            // check inline command ends in $end$
            if (inline_command_match[3].trim() != "end") {
                info.warn("Inline command must end with $end$. Line will be treated as text.");
            }
            else {
                let command = inline_command_match[1];
                let info = command.split(" ");
                let text = inline_command_match[2];
                return [
                    { type: ib_token_types.COMMAND, inline: true, text: line, command: info[0], params: info.slice(1) },
                    { type: ib_token_types.TEXT, inlie: true, text: text },
                    { type: ib_token_types.COMMAND, inline: true, text: "", command: "end", params: [] }
                ];
            }
        }

        // check if line is a single command
        let command_match = command_regex.exec(line.trim());
        if (command_match) {
            let command = command_match[1];
            let info = command.split(" ");
            return [{ type: ib_token_types.COMMAND, inline: false, text: line, command: info[0], params: info.slice(1) }];
        }

        // if neither matched warn and return text
        info.warn("Malformated command. Lines starting in $ must be a command or inline command. Line will be treated as text.");
        return [{ type: ib_token_types.TEXT, inline: false, text: line }];

    }

    //#endregion

    //#region execute

    static async execute(html, ctx) {
        let tokens = this.parse(html);
        // let a = 1;
        html = this.execute_tokens(tokens, ctx);

        return html;
    }

    static async execute_tokens(tokens, ctx) {
        let html = [];

        for (let token of tokens) {
            if (token.type == ib_token_types.TEXT) {
                html.push(await this.process_variables(token.text, ctx));
            }
            else {
                let command = token.command;
                let params = token.params;
                let body = token.body;

                switch (command) {
                    case "if":
                        html.push(await ib.execute_if(params, body, ctx));
                        break;
                    case "for":
                        html.push(await ib.execute_for(params, body, ctx));
                        break;
                    case "foreach":
                        html.push(await ib.execute_foreach(params, body, ctx));
                        break;
                    case "define":
                        await ib.execute_define(params, body, ctx);
                        break;
                    case "md":
                        html.push(await ib.execute_md(params, body, ctx));
                        break;
                    default:
                        console.error(`Command ${command} is not supported. Command block will be ignored`);
                }
            }
        };

        return html.join("\n");
    }

    static async process_variables(text, ctx) {
        // this is somewhat cleaner but still ugly as fuck
        // regex matches a non escaped strting # followed by anything up till a non escaped #
        // group 1 is any escaped \ or #
        // group 2 is eveything between the two hashes (excluding the hashes and any escapes at the end)
        // group 3 is any escaped \ or # at the end of the string imediately befor the final closing #
        let variable_regex = /(?:(?<!\\)((?:\\\\)*)#|(?:\\(?:\\\\)*#)#)((?:.(?!(?:(?<!\\)(?:(?:\\\\)*)#|(?:\\(?:\\\\)*#)#)))*.)(?:(?<!\\)((?:\\\\)*)#|(\\(?:\\\\)*#)#)/g;
        let escape_regex = /\\(\\|#)/g;
        return await this.asyncStringReplace(text, variable_regex, async (_full_match, g1, g2, g3) => {
            let left_padding = g1.replace(escape_regex, "$1");
            let data = `${g2}${g3}`.replace(escape_regex,"$1").match(/([^\\\s]|\\.)+/g).map(v => v.replace(/\\ /g, " "));
            debugger;
            let variable = data[0];
            let parameters = data.slice(1);
            return left_padding + await this.execute_variable(variable, parameters, ctx);
        });
    }

    static async process_single_variable(text, ctx) {
        let variable_regex = /^#([^#\\]*(?:\\.[^#\\]*)*)#$/g;
        if (!variable_regex.test(text)) {
            console.warn(`Expected variable in the form "#[variable name] [List of modifiers]?# but found ${text}. Will return null.`);
            return null;
        }

        let data = text.slice(1, -1).split(" ");

        return await this.execute_variable(data[0], data.slice(1), ctx);
    }

    static async float_or_single_var(text, ctx) {
        if (text[0] == "#") {
            return await this.process_single_variable(text, ctx);
        }
        else {
            let v = parseFloat(text);
            if (isNaN(v)) {
                console.warn(`Expected a float or a variable, but found ${text}. Will return null.`);
                return null;
            }
            else {
                return v;
            }
        }
    }

    static async constant_or_var_in_var(text, ctx) {
        // check for constant number
        let v = parseFloat(text);
        if(!isNaN(v)) {
            return v;
        }
        // check for string
        if (text[0] == '"') {
            return text.slice(1, -1);
        }
        // assume variable if not
        return await this.process_single_variable(`#${text}#`, ctx);
    }

    static async execute_variable(variable, parameters, ctx) {
        const index_regex = /^at\((.*)\)$/g;
        const parse_regex = /^parse\((.*)\)$/g;
        const load_regex = /^load\((.*)\)$/g;
        const allowed_modifiers = [
            // function call
            "call",
            // index
            index_regex,
            // formatting modifiers
            "uppercase", "lowercase", "capitalize", "capitalize-first", "trim",
            // processing modifiers
            parse_regex,
            // load modifiers
            load_regex,
        ];
        let [valid, params, modifiers] = this.validate_params("variable", parameters, 0, 1, allowed_modifiers);
        if (!valid) return "";

        let value;
        let value_type = params[0];
        switch (value_type) {
            case "number":
                let v = parseFloat(variable);
                if (isNaN(v)) {
                    console.warn(`Expected a number, but found ${variable}. Will assume 0.`);
                    value = 0;
                }
                else {
                    value = v;
                }
                break;
            case "string":
                value = variable;
                break;
            default:
                if (params.length == 1 && value_type != "var") {
                    console.warn(`Unkown value type ${value_type}. Will assume variable.`);
                }
                value = ib.contains_or_warn(ctx, variable, `Variable ${variable} is not defined. Returning null.`);
        }

        // apply modifiers
        for (let modifier of modifiers) {
            if (typeof(value) == "string") {
                switch (modifier) {
                    case "uppercase":
                        value = value.toUpperCase();
                        break;
                    case "lowercase":
                        value = value.toLowerCase();
                        break;
                    case "capitalize":
                        value = value.replace(/\w\S*/g, (txt) => {
                            return txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase();
                        });
                        break;
                    case "capitalize-first":
                        value = value.charAt(0).toUpperCase() + value.substr(1);
                        break;
                    case "trim":
                        value = value.trim();
                        break;
                    default:
                        // check regex matches
                        let parse_match = parse_regex.exec(modifier);
                        if (parse_match) {
                            let parser = parse_match[1];
                            switch (parser) {
                                case "ib":
                                    value = await this.execute(value, ctx);
                                    break;
                                case "md":
                                    value = marked(await this.execute(value, ctx));
                                    break;
                                case "puremd":
                                    value = marked(value);
                                    break;
                                case "json":
                                    value = JSON.parse(value);
                                    break;
                                default:
                                    console.warn(`Unknown parser ${parser}. Will ignore.`);
                            }
                            continue;
                        }
                        let load_match = load_regex.exec(modifier);
                        if (load_match) {
                            let loader = load_match[1];
                            switch (loader) {
                                case "ib":
                                    value = await this.get_ib_file(value, ctx);
                                    break;
                                case "md":
                                    value = marked(await this.get_ib_file(value, ctx));
                                    break;
                                case "puremd":
                                    value = marked(await this.get_file(value, ctx));
                                    break;
                                case "json":
                                    value = JSON.parse(await this.get_file(value, ctx));
                                    break;
                                case "text":
                                    value = await this.get_file(value, ctx);
                                    break;
                                default:
                                    console.warn(`Unknown loader ${loader}. Will return assume text.`);
                                    value = await this.get_file(value, ctx);
                            }
                            continue;
                        }
                        console.warn(`Modifier ${modifier} is not valid for type string. Will ignore.`);
                }
            }
            else if (typeof(value) == "number") {
                switch (modifier) {
                    default:
                        console.warn(`Modifier ${modifier} is not valid for type number. Will ignore.`);
                }
            }
            else if (value instanceof Array) {
                switch (modifier) {
                    default:
                        // check regex matches
                        let index_match = index_regex.exec(modifier);
                        if (index_match) {
                            let index = await this.constant_or_var_in_var(index_match[1], ctx);
                            if (typeof(index) == "number") {
                                let rounded_index = parseInt(index);
                                if (rounded_index != index) {
                                    console.warn(`Index ${index} is not an integer. Will round to ${rounded_index}.`);
                                }
                                value = value[rounded_index];
                            }
                            else{
                                console.warn(`Index ${index} is not a number. Will return null.`);
                                value = null;
                            }
                            break;
                        }
                        console.warn(`Modifier ${modifier} is not valid for type array. Will ignore.`);
                }
            }
            else if (value instanceof Function) {
                if (value.length != 0) {
                    console.warn(`Modifiers can only be applied to functions with 0 arity. Will return null.`);
                    value = null;
                }
                switch (modifier) {
                    case "call":
                        value = await value();
                        break;
                    default:
                        console.warn(`Modifier ${modifier} is not valid for type function. Will ignore.`);
                }
            }
            else if (value instanceof Object) {
                if (value == null) {
                    console.warn(`Modifiers cannot be applied to null. Will ignore remaining modifiers.`);
                    return null;
                }
                switch (modifier) {
                    default:
                        // check regex matches
                        let index_match = index_regex.exec(modifier);
                        if (index_match) {
                            let index = await this.constant_or_var_in_var(index_match[1], ctx);
                            value = value[index];
                            continue;
                        }
                        console.warn(`Modifier ${modifier} is not valid for type object. Will ignore.`);
                }
            }
        }

        return value;
    }

    //#region command

    static async execute_if(parameters, body, ctx) {
        const allowed_modifiers = ["unscoped"];
        let [valid, params, modifiers] = this.validate_params("if", parameters, 1, 1, allowed_modifiers);
        if (!valid) return "";

        // by default we add a scope to variables
        if (!this.contains(modifiers, "unscoped")) {
            ctx = this.scope_map(ctx);
        }

        let condition = await ib.process_single_variable(params[0], ctx);
        if (condition) {
            return await this.execute_tokens(body, ctx);
        }

    }

    static async execute_for(parameters, body, ctx) {
        const allowed_modifiers = ["unscoped"];
        let [valid, params, modifiers] = this.validate_params("for", parameters, 5, 5, allowed_modifiers);
        if (!valid) return "";

        // by default we add a scope to variables
        if (!this.contains(modifiers, "unscoped")) {
            ctx = this.scope_map(ctx);
        }

        // initialize variables
        let loopVariables = params[0].split(",");
        for (let i = 0; i < loopVariables.length; i++) {
            let loopVariable = loopVariables[i].split("=");
            let varName = loopVariable[0];
            let varValue = loopVariable.length == 2 ? await ib.float_or_single_var(loopVariable[1], ctx) : 0
            ctx[varName] = varValue;
        }

        // condition checking
        let loopCompVar = params[1];
        let loopCompComp = params[2];
        let loopCompConst = params[3];
        async function checkCondition() {
            let left = ib.contains_or_warn(ctx, loopCompVar, `Loop left comparison variable ${loopCompVar} does not exist in context. Will always assume false.`);
            let right = await ib.float_or_single_var(loopCompConst, ctx)
            if (left == null | right == null) return false;
            switch (loopCompComp) {
                case "==":
                    return left == right;
                case "<":
                    return left < right;
                case "<=":
                    return left <= right;
                case ">":
                    return left > right;
                case ">=":
                    return left >= right;
                default:
                    console.warn(`Loop comparison operator ${loopCompComp} is not supported. Will always assume false.`);
                    return false;
            }
        }

        // loop end incrementing
        let loopEnd = params[4].split(",");
        async function doEnd(bodzy) {
            for (let i = 0; i < loopEnd.length; i++) {
                let commandtokens = loopEnd[i].split("+=");
                let commandVar = commandtokens[0];
                let commandDelta = commandtokens[1];
                if (commandDelta[0] == "#") {
                    commandDelta = await body.direct_var(commandDelta.substr(1, commandDelta.length - 2), ctx);
                }
                else {
                    commandDelta = parseFloat(commandDelta);
                }
                ctx[commandVar] += commandDelta;
            };
        }

        // loop body
        let html = [];

        while (await checkCondition()) {
            html.push(await this.execute_tokens(body, ctx));
            await doEnd(this);
        }

        return html.join("\n");
    }

    static async execute_foreach(parameters, body, ctx) {
        const allowed_modifiers = ["unscoped", "reversed", "alphabetical", "alphareversed", "increasing", "decreasing", "randomized"];
        let [valid, params, modifiers] = this.validate_params("for", parameters, 2, 2, allowed_modifiers);
        if (!valid) return "";

        // by default we add a scope to variables
        if (!this.contains(modifiers, "unscoped")) {
            ctx = this.scope_map(ctx);
        }

        // initialize variable
        let loopVariable = params[0];
        let loopArray = ib.contains_or_warn(ctx, params[1], `Foreach array ${params[1]} does not exist in context. Will assume empty array.`, []);
        if (loopArray == null || typeof loopArray[Symbol.iterator] !== 'function') {
            console.warn(`Foreach array ${params[1]} is not iterable. Will assume empty array.`);
            loopArray = [];
        }

        // apply order modifiers
        modifiers.forEach(modifier => {
            switch (modifier) {
                case "reversed":
                    loopArray = loopArray.reverse();
                    break;
                case "alphabetical":
                    loopArray = loopArray.sort();
                case "alphareversed":
                    loopArray = loopArray.sort().reverse();
                case "increasing":
                    loopArray = loopArray.sort(function (a, b) { return a - b });
                case "decreasing":
                    loopArray = loopArray.sort(function (a, b) { return b - a });
                case "randomized":
                    loopArray = loopArray
                        .map(v => ({ v, i: Math.random() }))
                        .sort((a, b) => a.i - b.i)
                        .map(v => v.v);
                default:
                    break;
            }
        });

        // loop body
        let html = [];
        for (let v of loopArray) {
            ctx[loopVariable] = v;
            html.push(await ib.execute_tokens(body, ctx));
        };

        return html.join("\n");
    }

    static async command_load(token, ctx) {
        if (token.info.length < 2) return "null";

        let loadPath = this.var_string(token.info[1], ctx);
        let loadType = token.info[2];

        switch (loadType) {
            case "ib":
                return this.get_ib_html(loadPath, ctx)
            case "md": {
                return marked(await this.get_file(loadPath));
            }
            default:
                return this.get_file(loadPath);
        }
    }

    static async execute_define(parameters, body, ctx) {
        const allowed_modifiers = ["unscoped", "trim"];
        let [valid, params, modifiers] = this.validate_params("define", parameters, 1, 2, allowed_modifiers);
        if (!valid) return;

        // by default we add a scope to variables
        let og_ctx = ctx;
        if (!this.contains(modifiers, "unscoped")) {
            ctx = this.scope_map(ctx);
        }

        let varName = params[0];
        var varType = params[1];
        let value = await ib.execute_tokens(body, ctx);

        switch (varType) {
            case "number":
                let v = parseFloat(value);
                if (isNaN(v)) {
                    console.warn(`Expected a number, but found ${variable}. Will assume 0.`);
                    value = 0;
                }
                else {
                    value = v;
                }
                break;
            default:
                if (params.length != 1 && varType != "string") {
                    console.warn(`Unkown variable type ${varType}. Will assume string.`);
                }
                // execute string related modifiers
                for (let modifier of modifiers) {
                    switch (modifier) {
                        case "trim":
                            value = value.trim();
                            break;
                        default:
                            console.warn(`Modifier ${modifier} does not apply to strings. Will assume no action.`);
                            break;
                    }
                }
        }

        og_ctx[varName] = value;
    }

    static async execute_md(parameters, body, ctx) {
        const allowed_modifiers = ["unscoped", "pure"];
        let [valid, params, modifiers] = this.validate_params("define", parameters, 0, 0, allowed_modifiers);
        if (!valid) return "";

        // check if we are in pure mode
        if (this.contains(modifiers, "pure")) {
            return marked(this.get_original_text_from_tokens(body));
        }
        else {
            // by default we add a scope to variables
            if (!this.contains(modifiers, "unscoped")) {
                ctx = this.scope_map(ctx);
            }
            return marked(await this.execute_tokens(body, ctx));
        }

    }

    //#endregion

    //#endregion

}
