describe("API", function(){
    it("get_file reads file from path and returns contents", async () => {
        assert.equal(await ib.get_file("test_resources/HelloWorld.txt"), "Hello World!");
    });
    it("get_ib_html reads file from path with get_file and returns parsed ib_html", async() => {
        let vars = ib.get_file("test_resources/all_commands_vars.json");
        vars = JSON.parse(await vars);
        let ib_html = ib.get_ib_html("test_resources/all_commands.html", vars);
        let parsed_html = ib.get_file("test_resources/all_commands_parsed.html");
        assert.equal(await ib_html, await parsed_html);
    })
});

describe("Helpers", function(){
    it("remove_whitespace_items removes white space items from array", () => {
        let with_whitespace = ["", " ", "\n", "Hello", "\t", "World", "\n\t", "!"];
        let wihtout_whitespace = ["Hello", "World", "!"];
        assert.deepEqual(ib.remove_whitespace_items(with_whitespace), wihtout_whitespace);
    });
    it("scope_map returns deep equal copy of input array, but new object", () => {
        let original = new Map([
            ["Hello", "HELLO"],
            ["World", "WORLD"]
        ]);
        let copy = ib.scope_map(original);
        assert.notEqual(original, copy);
        assert.deepEqual(original, copy);
    });
    it("is_block returns true for tokens with block type", () => {
        let tokens = [
            new ib_token(ib_token_types.COMMAND, ["for"]),
            new ib_token(ib_token_types.COMMAND, ["define"]),
            new ib_token(ib_token_types.COMMAND, ["if"]),
            new ib_token(ib_token_types.COMMAND, ["foreach"]),
            new ib_token(ib_token_types.HTML, "for"),
            new ib_token(ib_token_types.VARIABLE, ["for"])
        ];
        assert.isOk(ib.is_block(tokens[0]));
        assert.isNotOk(ib.is_block(tokens[1]));
        assert.isNotOk(ib.is_block(tokens[2]));
        assert.isOk(ib.is_block(tokens[3]));
        assert.isNotOk(ib.is_block(tokens[4]));
        assert.isNotOk(ib.is_block(tokens[5]));
    });
    it("is_textual returns true for tokens with text type", () => {
        let tokens = [
            new ib_token(ib_token_types.COMMAND, ["for"]),
            new ib_token(ib_token_types.COMMAND, ["define"]),
            new ib_token(ib_token_types.COMMAND, ["if"]),
            new ib_token(ib_token_types.COMMAND, ["md"]),
            new ib_token(ib_token_types.HTML, "define"),
            new ib_token(ib_token_types.VARIABLE, ["md"])
        ];
        assert.isNotOk(ib.is_textual(tokens[0]));
        assert.isNotOk(ib.is_textual(tokens[1]));
        assert.isOk(ib.is_textual(tokens[2]));
        assert.isOk(ib.is_textual(tokens[3]));
        assert.isNotOk(ib.is_textual(tokens[4]));
        assert.isNotOk(ib.is_textual(tokens[5]));
    });
    it("is_end_token returns true if token is an end token", () => {
        let tokens = [
            new ib_token(ib_token_types.COMMAND, ["for"]),
            new ib_token(ib_token_types.COMMAND, ["define"]),
            new ib_token(ib_token_types.COMMAND, ["end"]),
            new ib_token(ib_token_types.COMMAND, ["md"]),
            new ib_token(ib_token_types.HTML, "end"),
            new ib_token(ib_token_types.VARIABLE, ["end"])
        ];
        assert.isNotOk(ib.is_end_token(tokens[0]));
        assert.isNotOk(ib.is_end_token(tokens[1]));
        assert.isOk(ib.is_end_token(tokens[2]));
        assert.isNotOk(ib.is_end_token(tokens[3]));
        assert.isNotOk(ib.is_end_token(tokens[4]));
        assert.isNotOk(ib.is_end_token(tokens[5]));
    });
    it("is_digit returns true for characters between 0 and 9", () => {
        assert.isOk(ib.is_digit("0"));
        assert.isOk(ib.is_digit("7"));
        assert.isNotOk(ib.is_digit("90"));
        assert.isOk(ib.is_digit("1"));
        assert.isNotOk(ib.is_digit("Hello"));
        assert.isNotOk(ib.is_digit("-2"));
        assert.isNotOk(ib.is_digit("7.3"));
    });
    it("promise_array the value at the given index of an array", () => {
        let test_array = [1,2,3,4];
        assert.equal(ib.promise_array(test_array, 0), 1);
        assert.equal(ib.promise_array(test_array, 5), undefined);
    });
    it("var_string properly parses variable strings", () => {
        let strings = [
            "#var#",
            "#var##var#test#var#",
            "\\#\\\\#var#",
            "#var##"
        ]
        let answers = [
            "variable",
            "variablevariabletestvariable",
            "#\variable",
            "variable"
        ]
        let vars = new Map();
        vars["var"] = "variable";
        for(let i = 0; i < strings.length; i++){
            let var_s = ib.var_string(strings[i], vars);
            assert.equal(var_s, answers[i]);
        }
    });
})