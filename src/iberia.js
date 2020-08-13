import("./marked.min.js");

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

    retreat(){
        this.current--;
    }

    goto(loc){
        this.current = loc;
    }
}

//#endregion

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
        switch(token.info[0]){
            case "for":
            case "foreach":
                return true;
            default:
                return false;
        }
    }

    static is_textual(token){
        switch(token.info[0]){
            case "define":
                return 2;
            case "md":
                return 1;
            default:
                return false;
        }
    }

    static is_end_token(token){
        if(token == undefined){
            return false;
        }else{
            return token.info[0] == "end";
        }
    }

    static is_digit(c){
        return c >= '0' && c <= '9';
    }

    static promise_array(a, i){
        return a[i];
    }

    static var_string(str, variables){
        let newString = [];
        for(let i = 0; i < str.length; i++){
            if(i + 1 < str.length && str[i] == "\\" && str[i+1] == "#"){
                newString.push("#");
                i++;
            }
            else if(str[i] == "#"){
                let start = i;
                let end = i+1;
                while(end < str.length && str[end] != "#"){
                    if(end + 1 < str.length && str[end]=="\\" && str[end + 1] == "#"){
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
            else{
                newString.push(str[i]);
            }
        }
        return newString.join("");
    }

    //#endregion

    //#region parse

    static parse(file){
        let tokens = [];
        let parser = new ib_parser(file);

        while(!parser.is_at_end()){
            tokens.push(this.parse_token(parser));
        }

        return tokens;
    }

    static parse_token(parser){
        let char = parser.peek();
        switch(char){
            case "$":
                return this.parse_command(parser);
            case "#":
                return this.parse_variable(parser);
            default:
                return this.parse_html(parser);
        }
    }

    static parse_command(parser){
        let cl = [];

        parser.advance();

        for(let char = parser.advance(); char != null && !parser.is_at_end() && char != "$"; char = parser.advance()){
            if(char == "\\" && parser.peek() == "$"){
                cl.push(parser.advance());
            }
            else{
                cl.push(char);
            }
        }

        let text = cl.join("");

        let tokens = text.trim().split(/(\s+)/);
        tokens = this.remove_whitespace_items(tokens);

        let token = new ib_token(ib_token_types.COMMAND, tokens);

        let textual = this.is_textual(token);
        if(this.is_block(token)){
            let block = [];
            for(let next_token = this.parse_token(parser); !parser.is_at_end() && !this.is_end_token(next_token); next_token = this.parse_token(parser)){
                block.push(next_token);
            }
            token.block = block;
        }
        else if(textual){
            if(token.info.length < textual + 1){
                console.error("Not enought parameters passed to " + token[0] + " command.");
            }
            token.info = token.info.slice(0, textual);
            let char = text[0];
            while(text.length > 0 && char != "\n"){
                text = text.substr(1);
                char = text[0];
            }
            if(text.length <= 0) console.error("Expected new line in " + token[0] + " command.");
                       
            token.text = text.substr(1);
        }

        return token;
    }

    static parse_variable(parser){
        let vl = [];

        parser.advance();

        for(let char = parser.advance(); char != null && !parser.is_at_end() && char != "#"; char = parser.advance()){
            if(char == "\\" && parser.peek() == "#"){
                vl.push(parser.advance());
            }
            else{
                vl.push(char);
            }
        }

        let tokens = vl.join("").trim().split(/(\s+)/);
        if(tokens.length > 1){
            console.error("Variable expects only one argument")
        }
        tokens = this.remove_whitespace_items(tokens);

        let token = new ib_token(ib_token_types.VARIABLE, tokens);

        return token;
    }

    static parse_html(parser){
        let html = [];

        let char = parser.advance();
        while(char != null && char != "#" && char != "$"){
            if(char == "\\" && (parser.peek() == "$" || parser.peek() == "#" || parser.peek("\\"))){
                html.push(parser.advance());
            }
            else{
                html.push(char);
            }

            char = parser.advance();
        }
        if(char == "#" || char == "$") parser.retreat();

        html = html.join("");
        
        let token = new ib_token(ib_token_types.HTML, html);
        return token;
    }

    //#endregion

    //#region execute

    static async execute(html, variables){
        let tokens = this.parse(html);
        // let a = 1;
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
            case "load":
                return this.command_load(token, variables);
            case "define":
                this.command_define(token, variables);
                break;
            case "md":
                return this.command_md(token, variables);
            default:
                console.error("Unknown command found.");
                return "null";
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
            loopCompConst = await this.direct_var(loopCompConst.substr(1, loopCompConst.length-2), variables);
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

        async function doEnd(body){
            for(let i = 0; i < loopEnd.length; i++){
                let commandtokens = loopEnd[i].split("+=");
                let commandVar = commandtokens[0];
                let commandDelta = commandtokens[1];
                if(commandDelta[0] == "#"){
                    commandDelta = await body.direct_var(commandDelta.substr(1, commandDelta.length-2), variables);
                }
                else{
                    commandDelta = parseFloat(commandDelta);
                }
                variables[commandVar] += commandDelta;
            };
        }

        let html = [];

        while(checkCondition()){
            html.push(await this.execute_tokens(token.block, variables));
            await doEnd(this);
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

    static async command_load(token, variables){
        if(token.info.length < 2) return "null";

        let loadPath = this.var_string(token.info[1], variables);
        let loadType = token.info[2];

        switch (loadType) {
            case "ib":
                return this.get_ib_html(loadPath, variables)
            case "md":{
                return marked(await this.get_file(loadPath));
            }
            default:
                return this.get_file(loadPath);
        }
    }

    static command_define(token, variables){
        variables[token.info[1]] = token.text;
        return "";
    }

    static command_md(token, variables){
        return marked(token.text);
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

        let var_info = token.info[0].split("->");
        let name = var_info[0];
        let modifier = var_info[1];

        let value = this.direct_var(name, variables);

        switch(modifier){
            case "ib":
                return this.execute(await value, this.scope_map(variables));
            case "ib_unscoped":
                return this.execute(await value, variables);
            case "md":
                return marked(await value);
            case "get":
            case "at":
            case "array":{
                let index = var_info[2];
                if(this.is_digit(index[0])){
                    index = parseInt(index);
                }
                else{
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