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

    static is_digit(c) {
        return c >= '0' && c <= '9';
    }

    static promise_array(a, i) {
        return a[i];
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

    static is_self_terminating_command(command) {
        switch (command) {
            case "load":
                return true;
            default:
                return false;
        }
    }

    static contains(arr, obj) {
        return arr.indexOf(obj) != -1;
    }

    static validate_params(command, parameters, min, max, allowed_modifiers = []) {
        let length = parameters.length;
        if (min == max && length != min) {
            if (length < min) {
                console.warn(`Command ${command} requires exactly ${min} parameters. Command block will be ignored.`);
                return [false, [], []];
            }
            else if(allowed_modifiers == []){
                console.warn(`Command ${command} requires exactly ${min} parameters. Extra parameters will be ignored.`);
                return [true, [parameters.slice(0, max)], []];
            }
        }
        if (length < min) {
            console.warn(`Command ${command} requires at least ${min} parameters. Command block will be ignored.`);
            return [false, [], []];
        }
        if (allowed_modifiers == [] && length > max) {
            console.warn(`Command ${command} allows at most ${max} parameters. Extra parameters will be ignored.`);
            return [true, [parameters.slice(0, max)], parameters];
        }
        if (allowed_modifiers != [] && length > max) {
            let params = parameters.slice(0, max);
            let modifiers = [];
            let modifier_count = length - max;
            for (let i = max + modifier_count - 1; i < length; i++) {
                let param = parameters[i];
                if (!this.contains(allowed_modifiers, param)) {
                    console.warn(`Command ${command} does not allow modifier ${param}. Modifier will be ignored.`);
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
        while (i < tokens.length && !(till_end && this.is_end_token(tokens[i]))) {
            let token = tokens[i];
            if (token.type == ib_token_types.COMMAND && !this.is_self_terminating_command(token.command)) {
                let body;
                [body, tokens] = this.nest_commands(tokens.slice(i + 1), true)
                token.body = body;
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

        return [nested_tokens, tokens.slice(i + (till_end ? 1 : 0))];

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
                    { type: ib_token_types.COMMAND, command: info[0], params: info.slice(1) },
                    { type: ib_token_types.TEXT, text: text },
                    { type: ib_token_types.COMMAND, command: "end", params: [] }
                ];
            }
        }

        // check if line is a single command
        let command_match = command_regex.exec(line.trim());
        if (command_match) {
            let command = command_match[1];
            let info = command.split(" ");
            return [{ type: ib_token_types.COMMAND, command: info[0], params: info.slice(1) }];
        }

        // if neither matched warn and return text
        info.warn("Malformated command. Lines starting in $ must be a command or inline command. Line will be treated as text.");
        return [{ type: ib_token_types.TEXT, text: line }];

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

        for (let i = 0; i < tokens.length; i++) {
            let token = tokens[i];
            if (token.type == ib_token_types.TEXT) {
                html.push(await this.process_variables(token.text, ctx));
            }
            else {
                let command = token.command;
                let params = token.params;
                let body = token.body;

                switch (command) {
                    case "if":
                        // html.push(await execute_if(params, body, variables));
                        break;
                    case "for":
                        html.push(await this.execute_for(params, body, ctx));
                        break;
                    case "foreach":
                        // html.push(await execute_foreach(params, body, variables));
                        break;
                    case "define":
                        // html.push(await execute_define(params, body, variables));
                        break;
                    case "load":
                        // html.push(await execute_load(params, variables));
                        break;
                    case "md":
                        // html.push(await execute_md(params, variables));
                        break;
                    default:
                        console.error("Command " + command + " is not supported. Command block will be ignored");
                }
            }
        };

        return html.join("\n");
    }

    static async process_variables(text, ctx) {
        let variable_regex = /#([^#\\]*(?:\\.[^#\\]*)*)#/g;
        return await this.asyncStringReplace(text, variable_regex, async (data_str) => {
            let data = data_str.slice(1, -1).split(" ");
            let variable = data[0];
            let modifiers = data.slice(1);
            return await this.execute_variable(variable, modifiers, ctx);
        })
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

    static async float_or_signal_var(text, ctx) {
        if (text[0] == "#") {
            return await this.process_single_variable(text, ctx);
        }
        else {
            try{
                return parseFloat(text);
            }
            catch(e){
                console.warn(`Expected a float or a variable, but found ${text}. Will return 0.`);
                return 0;
            }
        }
    }

    static async execute_variable(variable, modifiers, ctx) {
        if (!ctx.hasOwnProperty(variable)) {
            console.warn(`Variable ${variable} does not exist in context. Returning null.`);
            return null;
        }
        return ctx[variable];
    }

    //#region command

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
            let varValue = loopVariable.length == 2 ? await ib.float_or_signal_var(loopVariable[1], ctx) : 0
            ctx[varName] = varValue;
        }

        // condition checking
        let loopCompVar = params[1];
        let loopCompComp = params[2];
        let loopCompConst = params[3];
        async function checkCondition() {
            let left = ctx[loopCompVar];
            let right = await ib.float_or_signal_var(loopCompConst, ctx);
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

    static async command_foreach(token, ctx) {
        ctx = this.scope_map(ctx);

        if (token.info.length < 3) {
            console.error("Not enough parameters passed to for loop.");
            return "null";
        }
        else if (token.info.length > 4) {
            console.warn("Too many parameters passed to for loop");
        }

        let loopVar = token.info[1];
        let loopArray = await this.variable(
            new ib_token(ib_token_types.VARIABLE, [token.info[2]]),
            ctx
        );
        let loopModifier = token.info[3];

        switch (loopModifier) {
            case "reversed":
                loopArray = loopArray.reverse();
                break;
            case "alphabetical":
                loopArray = loopArray.sort();
            case "alphareverse":
                loopArray = loopArray.sort().reverse();
            case "increasing":
                loopArray = loopArray.sort(function (a, b) { return a - b });
            case "decreasing":
                loopArray = loopArray.sort(function (a, b) { return b - a });
            case "random":
                loopArray = loopArray
                    .map(v => ({ v, i: Math.random() }))
                    .sort((a, b) => a.i - b.i)
                    .map(v => v.v);
            default:
                break;
        }

        let html = [];

        for (let i = 0; i < loopArray.length; i++) {
            ctx[loopVar] = loopArray[i];
            html.push(await this.execute_tokens(token.block, ctx));
        }

        return html.join("");
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

    static command_define(token, ctx) {
        ctx[token.info[1]] = token.text;
        return "";
    }

    static command_md(token, ctx) {
        return marked(token.text);
    }

    //#endregion

    //#region variable

    static async direct_var(name, ctx) {
        let value = ctx[name];

        if (value == undefined) {
            console.error("Variable " + name + " undefined.");
            return "null";
        }

        return value;
    }

    static async variable(token, ctx) {
        if (token.info.length == 0) {
            console.error("Empty variable found.");
        }

        let var_info = token.info[0].split("->");
        let name = var_info[0];
        let modifier = var_info[1];

        let value = this.direct_var(name, ctx);

        switch (modifier) {
            case "ib":
                return this.execute(await value, this.scope_map(ctx));
            case "ib_unscoped":
                return this.execute(await value, ctx);
            case "md":
                return marked(await value);
            case "get":
            case "at":
            case "array": {
                let index = var_info[2];
                if (this.is_digit(index[0])) {
                    index = parseInt(index);
                }
                else {
                    index = await this.direct_var(index, ctx);
                }
                return this.promise_array(await value, index);
            }

            default:
                return value;
        }
    }

    //#endregion

    //#endregion

}
