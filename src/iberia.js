import("./marked.min.js")

//#region ib_classes

const ib_token_types = {
    COMMAND: 0,
    VARIABLE: 1,
    HTML: 2
}

class ib_token{
    constructor(type, info){
        this.type = type;
        this.info = info;
    }
}

class ib_parser{
    constructor(file){
        this.current = 0;
        this.file = file;
        this.size = file.length;
    }

    is_at_end(){
        return this.current == this.size;
    }

    advance(){
        if(this.is_at_end()) return null;
        this.current++;
        return this.file[this.current - 1];
    }
    
    peek(){
        if(this.is_at_end()) return null;
        return this.file[this.current];
    }
}

//#endregion

//#region ib

class ib{

    //#region api

    static async get_file(path){
        if(typeof(fetch)!="undefined"){
            let response = await fetch(path);
            return response.text();
        }
    
        return new Promise(function(resolve){
            let xhr = new XMLHttpRequest();
            xhr.open("GET", path, true);
            xhr.onload = function(){
                resolve(xhr.response);
            };
            xhr.onerror = function(){
                resolve(undefined);
                console.error("** An error occurred during the XMLHttpRequest");
            }
            xhr.send();
        })
    }

    static async get_ib_html(path, variables){
        let html = await this.get_file(path)
        html = await this.execute(html, variables);
        return html;
    }

    static async insert_text(destination, text){
        document.querySelector(destination).innerHTML = text;
    }

    static async insert_file(path, destination){
        let html = await this.get_file(path);
        this.insert_text(destination, html);
    }

    static async insert_ib_html(path, destination, variables){
        let html = await this.get_ib_html(path, variables);
        this.insert_text(destination, html);
    }

    //#endregion

    //#region helpers

    static remove_whitespace_items(array){
        return array.filter((el) => {
            return el.trim() !== '';
        });
    }

    static scope_map(variables){
        var newMap = new Map();
        Object.keys(variables).forEach(key => {
            newMap[key] = variables[key];
        })
        return newMap;
    }

    static is_block(token){
        if(token.info.size == 0){
            return false;
        }
        let name = token.info[0];
        switch(name){
            case "for":
            case "foreach":
            case "define":
            case "md":
                return true;
            default:
                return false;
        }
    }

    //#endregion

    //#region parse

    static parse(file){
        let tokens = [];
        let parser = new ib_parser(file);

        let html = [];

        while(!parser.is_at_end()){
            let char = parser.advance();
            switch(char){
                case "$":
                    if(html.length != 0){
                        tokens.push(new ib_token(ib_token_types.HTML, html.join("")));
                        html = [];
                    }
                    tokens.push(new ib_token(ib_token_types.COMMAND, this.parse_command(parser)));
                    break;
                case "#":
                    if(html.length != 0){
                        tokens.push(new ib_token(ib_token_types.HTML, html.join("")));
                        html = [];
                    }
                    tokens.push(new ib_token(ib_token_types.VARIABLE, this.parse_variable(parser)));
                    break;
                case "\\":
                    if(parser.peek() == "$" || parser.peek() == "#"){
                        html.push(parser.advance());
                    }
                    else{
                        html.push(char);
                    }
                    break;
                default:
                    html.push(char);
                    break;
            }
        }

        if(html.length != 0){
            tokens.push(new ib_token(ib_token_types.HTML, html.join("")));
        }

        return tokens;
    }

    static parse_command(parser){
        let cl = [];

        for(let char = parser.advance(); char != null && !parser.is_at_end() && char != "$"; char = parser.advance()){
            if(char == "\\" && char.peek() == "$" && char.peek() == "#"){
                cl.push(parser.advance());
            }
            else{
                cl.push(char);
            }
        }

        let tokens = cl.join("").trim().split(" ");
        tokens = this.remove_whitespace_items(tokens);

        return tokens;
    }

    static parse_variable(parser){
        let vl = [];

        for(let char = parser.advance(); char != null && !parser.is_at_end() && char != "#"; char = parser.advance()){
            if(char == "\\" && char.peek() == "#"){
                vl.push(parser.advance());
            }
            else{
                vl.push(char);
            }
        }

        let tokens = vl.join("").trim().split(" ");

        tokens = this.remove_whitespace_items(tokens);

        return tokens;
    }

    //#endregion

    //#region subset

    static subset(tokens){
        let new_tokens = [];

        while(tokens.length != 0){
            if(tokens[0].type == ib_token_types.COMMAND){
                if(tokens[0].info.size < 1){
                    console.log("Empty command found");
                }
                else if(this.is_block(tokens[0])){
                    new_tokens.push(tokens[0]);
                    tokens.shift();
                    new_tokens[new_tokens.length - 1].block = this.subset(tokens);
                }
                else if(tokens[0].info[0] == "end"){
                    tokens.shift();
                    return new_tokens;
                }
            }
            if(tokens.length != 0){
                new_tokens.push(tokens[0]);
                tokens.shift();
            }
        }

        return new_tokens;
    }

    //#endregion

    //#region execute

    static async execute(html, variables){
        let tokens = this.parse(html);
        tokens = this.subset(tokens);

        html = this.execute_tokens(tokens, variables);

        return html;
    }

    static async execute_tokens(tokens, variables){
        let html = [];

        for(let i = 0; i < tokens.length; i++){
            let new_line;
            let token = tokens[i];
            switch(token.type){
                case ib_token_types.COMMAND:
                    new_line = await this.command(token, variables);
                    break;
                case ib_token_types.VARIABLE:
                    new_line = await this.variable(token, variables);
                    break;
                case ib_token_types.HTML:
                    new_line = token.info;
                    break;
            }
            html.push(new_line);
        };

        return html.join("");
    }

    //#region command

    static async command(token, variables){
        if(token.length == 0){
            console.error("Empty command found.");
            return "null";
        }

        switch(token.info[0]){
            case "for":
                return this.command_for(token, variables);
            case "foreach":
                return this.command_foreach(token, variables);
        //     case "load":
        //         return this.command_load(token, variables);
        //     case "define":
        //         await this.command_define(token, variables);
        //         break;
        //     case "md":
        //         return this.command_md(token, variables);
        //     default:
        //         console.error("Unknown command found.");
        //         return "null";
        }
    }

    static async command_for(token, variables){
        variables = this.scope_map(variables);
        if(token.info.length < 6){
            console.error("Not enough parameters passed to for loop.");
            return "null";
        }
        else if(token.info.length > 6){
            console.warn("Too many parameters passed to for loop");
        }

        let loopVariables = token.info[1].split(",");
        let loopCompVar = token.info[2];
        let loopCompComp = token.info[3];
        
        let loopCompConst = token.info[4];
        if(loopCompConst[0] == "#"){
            loopCompConst = ib_inline_var(variables, loopCompConst.slice(1));
        }else{
            loopCompConst = parseFloat(loopCompConst);
        }

        let loopEnd = token.info[5].split(",");

        for(let i = 0; i < loopVariables.length; i++){
            let loopVariable = loopVariables[i].split("=");
            let varName = loopVariable[0];
            let varValue = loopVariable.length==2?parseFloat(loopVariable[1]):0
            variables[varName] = varValue;
        }

        function checkCondition(){
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

        function doEnd(){
            loopEnd.forEach((command) => {
                let commandtokens = command.split("+=");
                let commandVar = commandtokens[0];
                let commandDelta = parseFloat(commandtokens[1]);
                variables[commandVar] += commandDelta;
            });
        }

        let html = [];

        while(checkCondition()){
            html.push(await this.execute_tokens(token.block, variables));
            doEnd();
        }

        return html.join("");
    }

    static async command_foreach(token, variables){
        variables = this.scope_map(variables);
        
        if(token.info.length < 3){
            console.error("Not enough parameters passed to for loop.");
            return "null";
        }
        else if(token.info.length > 4){
            console.warn("Too many parameters passed to for loop");
        }

        let loopVar = token.info[1];
        let loopArray = await this.direct_var(token.info[2], variables);
        let loopModifier = token.info[3];

        switch(loopModifier){
            case "reversed":
                loopArray = loopArray.reverse();
                break;
            case "alphabetical":
                loopArray = loopArray.sort();
            case "alphareverse":
                loopArray = loopArray.sort().reverse();
            case "increasing":
                loopArray = loopArray.sort(function(a, b){return a - b});
            case "decreasing":
                loopArray = loopArray.sort(function(a, b){return b - a});
            case "random":
                loopArrau = loopArray.sort(function(a, b){return a - Math.random()});
            default:
                break;
        }

        let html = [];

        for(let i = 0; i < loopArray.length; i++){
            variables[loopVar] = loopArray[i];
            html.push(await this.execute_tokens(token.block, variables));
        }

        return html.join("");
    }

    //#endregion

    //#region variable

    static async direct_var(name, variables){
        let value = variables[name];

        if(value == undefined){
            console.error("Variable " + name + " undefined.");
            return "null";
        }

        return value;
    }

    static async variable(token, variables){
        if(token.info.length == 0){
            console.error("Empty variable found.");
        }

        let value = this.direct_var(token.info[0], variables);

        if(token.info.length == 1){
            return value;
        }
    }

    //#endregion

    //#endregion

}

//#endregion