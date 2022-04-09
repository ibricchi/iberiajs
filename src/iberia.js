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

    static async get_ib_file(path, variables) {
        let html = await this.get_file(path)
        html = await this.execute(html, variables);
        return html;
    }

    static async insert_text(destination, text) {
        document.querySelector(destination).innerHTML = text;
    }

    static async insert_file(path, destination) {
        let html = await this.get_file(path);
        this.insert_text(destination, html);
    }

    static async insert_ib_file(path, destination, variables) {
        let html = await this.get_ib_html(path, variables);
        this.insert_text(destination, html);
    }

    //#endregion

    //#region helpers

    static scope_map(variables) {
        var newMap = new Map();
        Object.keys(variables).forEach(key => {
            newMap[key] = variables[key];
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

    static var_string(str, variables) {
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
                let value = this.direct_var(name, variables);
                newString.push(variables[name]);
            }
            else {
                newString.push(str[i]);
            }
        }
        return newString.join("");
    }

    static is_self_terminating_command(command) {
        switch(command) {
            case "load":
                return true;
            default:
                return false;
        }
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

        return [nested_tokens, tokens.splice(i + (till_end ? 1 : 0))];

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
            return [{type: ib_token_types.COMMAND, command: info[0], params: info.slice(1) }];
        }

        // if neither matched warn and return text
        info.warn("Malformated command. Lines starting in $ must be a command or inline command. Line will be treated as text.");
        return [{ type: ib_token_types.TEXT, text: line }];

    }

    //#endregion

    //#region execute

    static async execute(html, variables) {
        let tokens = this.parse(html);
        // let a = 1;
        html = this.execute_tokens(tokens, variables);

        return html;
    }

    static async execute_tokens(tokens, variables) {
        let html = [];

        tokens.forEach(token => {
            if(token.type == ib_token_types.TEXT) {
                html.push(token.text);
            }
            else {
                let command = token.command;
                let params = token.params;
                let body = token.body;

                switch (command) {
                    case "if":
                        html.push(await execute_if(params, body, variables));
                        break;
                    case "for":
                        html.push(await execute_for(params, body, variables));
                        break;
                    case "foreach":
                        html.push(await execute_foreach(params, body, variables));
                        break;
                    case "define":
                        html.push(await execute_define(params, body, variables));
                        break;
                    case "load":
                        html.push(await execute_load(params, variables));
                        break;
                    case "md":
                        html.push(await execute_md(params, variables));
                        break;
                    default:
                        console.error("Command " + command + " is not supported. Command block will be ignored");
                }
            }
        });

        return html.join("\n");
    }

    //#region command

    static async execute_for(params, body, variables) {
    }

    static async command_for(token, variables) {
        variables = this.scope_map(variables);
        if (token.info.length < 6) {
            console.error("Not enough parameters passed to for loop.");
            return "null";
        }
        else if (token.info.length > 6) {
            console.warn("Too many parameters passed to for loop");
        }

        let loopVariables = token.info[1].split(",");
        let loopCompVar = token.info[2];
        let loopCompComp = token.info[3];

        let loopCompConst = token.info[4];
        if (loopCompConst[0] == "#") {
            loopCompConst = await this.variable(
                new ib_token(ib_token_types.VARIABLE, [loopCompConst.substr(1, loopCompConst.length - 2)]),
                variables
            );
        } else {
            loopCompConst = parseFloat(loopCompConst);
        }

        let loopEnd = token.info[5].split(",");

        for (let i = 0; i < loopVariables.length; i++) {
            let loopVariable = loopVariables[i].split("=");
            let varName = loopVariable[0];
            let varValue = loopVariable.length == 2 ? parseFloat(loopVariable[1]) : 0
            variables[varName] = varValue;
        }

        function checkCondition() {
            switch (loopCompComp) {
                case "==":
                    return variables[loopCompVar] == loopCompConst;
                case "<":
                    return variables[loopCompVar] < loopCompConst;
                case "<=":
                    return variables[loopCompVar] <= loopCompConst;
                case ">":
                    return variables[loopCompVar] > loopCompConst;
                case ">=":
                    return variables[loopCompVar] >= loopCompConst;
                default:
                    return false;
            }
        }

        async function doEnd(body) {
            for (let i = 0; i < loopEnd.length; i++) {
                let commandtokens = loopEnd[i].split("+=");
                let commandVar = commandtokens[0];
                let commandDelta = commandtokens[1];
                if (commandDelta[0] == "#") {
                    commandDelta = await body.direct_var(commandDelta.substr(1, commandDelta.length - 2), variables);
                }
                else {
                    commandDelta = parseFloat(commandDelta);
                }
                variables[commandVar] += commandDelta;
            };
        }

        let html = [];

        while (checkCondition()) {
            html.push(await this.execute_tokens(token.block, variables));
            await doEnd(this);
        }

        return html.join("");
    }

    static async command_foreach(token, variables) {
        variables = this.scope_map(variables);

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
            variables
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
            variables[loopVar] = loopArray[i];
            html.push(await this.execute_tokens(token.block, variables));
        }

        return html.join("");
    }

    static async command_load(token, variables) {
        if (token.info.length < 2) return "null";

        let loadPath = this.var_string(token.info[1], variables);
        let loadType = token.info[2];

        switch (loadType) {
            case "ib":
                return this.get_ib_html(loadPath, variables)
            case "md": {
                return marked(await this.get_file(loadPath));
            }
            default:
                return this.get_file(loadPath);
        }
    }

    static command_define(token, variables) {
        variables[token.info[1]] = token.text;
        return "";
    }

    static command_md(token, variables) {
        return marked(token.text);
    }

    //#endregion

    //#region variable

    static async direct_var(name, variables) {
        let value = variables[name];

        if (value == undefined) {
            console.error("Variable " + name + " undefined.");
            return "null";
        }

        return value;
    }

    static async variable(token, variables) {
        if (token.info.length == 0) {
            console.error("Empty variable found.");
        }

        let var_info = token.info[0].split("->");
        let name = var_info[0];
        let modifier = var_info[1];

        let value = this.direct_var(name, variables);

        switch (modifier) {
            case "ib":
                return this.execute(await value, this.scope_map(variables));
            case "ib_unscoped":
                return this.execute(await value, variables);
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
                    index = await this.direct_var(index, variables);
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
