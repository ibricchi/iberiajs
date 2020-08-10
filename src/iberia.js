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

class ib_token_list{
    constructor(tokens){
        this.current = 0;
        this.tokens = tokens;
        this.size = tokens.length;
    }

    is_at_end(){
        return this.current == this.size;
    }

    advance(){
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
            if(char == "\\" && char.peek() == "$"){
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


    //#region execute

    static async execute(html, variables){
        let tokens = new ib_token_list(this.parse(html));

        html = [];

        for(let i = 0; i < tokens.size; i++){
            let new_line;
            let token = tokens.tokens[i];
            switch(token.type){
                case ib_token_types.COMMAND:
                    new_line = await this.command(token.info, variables);
                    break;
                case ib_token_types.VARIABLE:
                    new_line = await this.variable(token.info, variables);
                    break;
                case ib_token_types.HTML:
                    new_line = token.info;
                    break;
            }
            html.push(new_line);
        };

        return html.join("");
    }

    static async command(tokens, variables){
        return tokens.join(" ");
    }

    static async variable(tokens, variables){
        return tokens.join(" ");
    }

    //#endregion

}

//#endregion