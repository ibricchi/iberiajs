//#region imports

import("./marked.min.js");

//#endregion

//#region control_functions

async function ib_insert_ib_html(path, destination, variables){
    let html = await ib_get_ib_html(path, variables);
    document.querySelector(destination).innerHTML = html;
}

async function ib_insert_file(path, destination){
    let html = await ib_get_file(path);
    document.querySelector(destination).innerHTML = html;
}

async function ib_get_ib_html(path, variables){
    let html = await ib_get_file(path);
    html = await ib_pre_process(variables, html);

    return html;
}

async function ib_get_file(path){
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

class ib_parser{
    constructor(input_file){
        this.current = 0;
        this.lines = input_file.split("\n");
        for(let i = 0; i < this.lines.length; i++){
            this.lines[i] = this.lines[i].trim();
        }
    }

    is_at_end(){
        return this.current >= this.lines.length;
    }

    advance(){
        if(this.is_at_end()){
            return null;
        }
        this.current++;
        return this.lines[this.current - 1];
    }

    peek(){
        if(this.is_at_end()){
            return null;
        }
        return this.lines[this.current];
    }

    goto(a){
        this.current = a;
    }

}

async function ib_pre_process(variables, text){
    let parser = new ib_parser(text);
    
    let html = [];

    while(!parser.is_at_end()){
        let line = parser.advance();
        html.push(await ib_line(parser, variables, line));
    }

    html = html.join("\n");
    return html;
}

async function ib_line(parser, variables, line){
    if(line[0] == "$"){
        return await ib_command(parser, variables, line.slice(1).trim());
    }

    if(line[0] == "\\" && line[1] == "$"){
        line.slice(1);
    }

    return ib_html(variables, line);
}

//#endregion

//#region helper_functions

function ib_string(variables, str){
    let newString = [];
    for(let i = 0; i < str.length; i++){
        if(i + 1 < str.length && str[i] == "\\" && str[i+1] == "#"){
            newString.push("#");
            i++;
        }
        else if(str[i] == "#"){
            start = i;
            end = i+1;
            while(end < str.length && str[end] != "#"){
                if(end + 1 < str.length && str[end]=="\\" && str[end + 1] == "#"){
                    str = str.slice(0, end) + str.slice(end + 1);
                    end++;
                }
                end++;
            }

            i = end;

            let name = str.slice(start + 1, end);
            let value = variables[name];
            value = value==undefined?"null":value;
            newString.push(variables[name]);
        }
        else{
            newString.push(str[i]);
        }
    }
    return newString.join("");
}

function ib_scope_map(variables){
    var newMap = new Map();
    Object.keys(variables).forEach(key => {
        newMap[key] = variables[key];
    })
    return newMap;
}

//#endregion

//#region commands

async function ib_command(parser, variables, line){
    tokens = line.split(" ");
    switch (tokens[0]) {
        case "for":
            return await ib_command_for(parser, variables, tokens);
        case "foreach":
            return await ib_command_foreach(parser, variables, tokens);
        case "load":
            return await ib_command_load(parser, variables, tokens)
        case "define":
            await ib_command_define(parser, variables, tokens);                
            break;
        case "var":
            return await ib_command_var(parser, variables, tokens);
        case "md":
            return await ib_command_md(parser, variables, tokens);
        default:
            return "";
    }
    return "";
}

async function ib_command_for(parser, variables, tokens){
    variables = ib_scope_map(variables);
    if(tokens.length < 6) return null;

    let loopVariables = tokens[1].split(",");
    let loopCompVar = tokens[2];
    let loopCompComp = tokens[3];
    
    let loopCompConst = tokens[4];
    if(loopCompConst[0] == "#"){
        loopCompConst = ib_inline_var(variables, loopCompConst.slice(1));
    }else{
        loopCompConst = parseFloat(loopCompConst);
    }

    let loopEnd = tokens[5].split(",");

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
        loopEnd.forEach(command => {
            commandTokens = command.split("+=");
            commandVar = commandTokens[0];
            commandDelta = parseFloat(commandTokens[1]);
            variables[commandVar] += commandDelta;
        });
    }

    let html = [];
    let start = parser.current;

    while(checkCondition()){
        parser.goto(start);
        let nextLine = parser.advance();
        while(nextLine != null && (nextLine.length < 2 || (nextLine[0] != "$" && nextLine.slice(1).trim() != "end"))){
            html.push(await ib_line(parser, variables, nextLine));
            nextLine = parser.advance();
        }
        doEnd();
    }

    html = html.join("\n");
    return html;
}

async function ib_command_foreach(parser, variables, tokens){
    variables = ib_scope_map(variables);
    if(tokens.length < 3) return "null";

    let loopVar = tokens[1];
    let loopArray = ib_inline_var(variables, tokens[2]);
    let loopModifier = tokens.length<3?"":tokens[3];

    switch(loopModifier){
        case "reversed":
            loopArray = loopArray.reverse();
            break;
        case "alphabetical":
            loopArray = loopArray.sort();
        case "alphareversed":
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
    let start = parser.current;

    for(let i = 0; i < loopArray.length; i++){
        variables[loopVar] = loopArray[i];
        parser.goto(start);
        let nextLine = parser.advance();
        while(nextLine != null && (nextLine.length < 2 || (nextLine[0] != "$" && nextLine.slice(1).trim() != "end"))){
            html.push(await ib_line(parser, variables, nextLine));
            nextLine = parser.advance();
        }
    }

    html = html.join("\n");
    return html;
}

async function ib_command_load(parser, variables, tokens){
    if(tokens.length < 2) return "null";

    let loadPath = ib_string(variables, tokens[1]);
    let loadType = tokens.length<2?"":tokens[2];

    switch (loadType) {
        case "ib_html":
            return ib_get_ib_html(loadPath, variables)
        case "md":
            return marked(await ib_get_file(loadPath));
        default:
            return ib_get_file(loadPath);
    }
}

async function ib_command_define(parser, variables, tokens){
    if(tokens.length < 2) return "null";

    let name = ib_string(variables, tokens[1]);

    let html = [];
    let nextLine = parser.advance();
    while(nextLine != null && (nextLine.length < 2 || (nextLine[0] != "$" && nextLine.slice(1).trim() != "end"))){
        html.push(nextLine);
        nextLine = parser.advance();
    }
    html = html.join("\n");
    variables[name] = html;
}

async function ib_command_var(parser, variables, tokens){
    if(tokens.length < 2) return "null";

    let name = ib_string(variables, tokens[1]);
    let special = tokens.length<2?"":tokens[2];

    html = variables[name];
    if(html == null) return "null";

    switch (special) {
        case "ib_html":
            return await ib_pre_process(ib_scope_map(variables), html);
        case "unscoped_ib_html":
            return await ib_pre_process(variables, html);
        case "md":
            return marked(html);
        default:
            return html;
    }
}

async function ib_command_md(parser, variables, tokens){
    md = [];
    let nextLine = parser.advance();
    while(nextLine != null && (nextLine.length < 2 || (nextLine[0] != "$" && nextLine.slice(1).trim() != "end"))){
        md.push(await ib_line(parser, variables, nextLine));
        nextLine = parser.advance();
    }
    md = md.join('\n');
    return marked(md);
}


//#endregion

//#region inline

function ib_html(variables, line){
    let newLine = [];
    for(let i = 0; i < line.length; i++){
        if(i+1 < line.length && line[i] == "\\" && line[i+1] == "$"){
            newLine.push("$");
            i++;
        }
        else if(line[i] == "$"){
            let end = i + 1;
            let is_inline_var = true;
            if(end < line.length && line[end] == "$"){
                is_inline_var = false;
                end++;
            }
            
            while(end < line.length && line[end] != "$"){
                if(end + 1 < line.length && line[end] == "\\" && line[end+1] == "$"){
                    line = line.slice(0, end) + line.slice(end + 1);
                }
                end++;
            }
            var name = line.slice(i + (is_inline_var?1:2), end);
            
            if(is_inline_var){
                newLine.push(ib_inline_var(variables, name));
            }
            else{
                newLine.push(ib_inline_command(variables, name));
            }

            i = end;
        }
        else{
            newLine.push(line[i]);
        }
    }
    return newLine.join("");
}

function ib_inline_var(variables, name){
    if(name in variables){
        return variables[name];
    }
    else{
        return "null";
    }
}

function ib_inline_command(variables, name){
    let tokens = name.trim().split(" ");
    switch(tokens[0]){
        case "array":
            return ib_inline_array(tokens, variables, name);
        default:
            return "null"
    }
}

function ib_inline_array(tokens, variables, name){
    if(tokens.length < 3) return "null";
    let array_name = tokens[1];
    let array_index = tokens[2];

    if(array_index[0] == "#"){
        array_index = ib_inline_var(variables, array_index.slice(1));
    }

    if(!(array_name in variables)) return "null";
    if(!(array_index in variables[array_name])) return "null";
    return variables[array_name][array_index];
}

//#endregion
