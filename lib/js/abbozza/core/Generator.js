/**
 * @license
 * abbozza!
 *
 * Copyright 2015-2018 Michael Brinkmeier ( michael.brinkmeier@uni-osnabrueck.de )
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/**
 * @fileoverview abbozza! Code generator
 * 
 * @author michael.brinkmeier@uni-osnabrueck.de (Michael Brinkmeier)
 * 
 * The code generator is responsible for the transformation og abbozza! blocks
 * into code. It uses a code template and replaces a series of hook with the
 * generated code.
 * 
 * The code template is given by the file js/abbozza/<system>/code_template in
 * the abbozza! file tree.
 * 
 * Descriptions of hooks
 * =====================
 * 
 * ###defines###
 * This hook may contain additional defines and macros if a preprocessor is used.
 * 
 * ###libraries##
 * This hook may contain a series of libraries which have to be included.
 * To avoid multiple import of the same library, new libraries have to be added
 * via AbbozzaGenerator.addLibrary(<lib>). 
 * 
 * ###globalvars##
 * This hook is replaced by the declaration of global variables.
 * 
 * ###main###
 * The code generated by the main block, i.e. the one, whose type is starting 
 * with 'main'
 * 
 * ###inithook###
 * This hook allows to add code, which is executed right after the definition
 * of global variables. Ist may be used to initialize Objects etc. Lines have
 * to be added via AbbozzaGenerator.addInitCode(line)
 * 
 * ###setuphook###
 * This hook allows to add code, which is executed onece, right before the 
 * code generated by the main block.
 * 
 * ###blocks###
 * The code generated by all top level blocks 8operations, event handlers etc.),
 * whose type does NOT start with 'main'
 * 
 * ###devices##
 * Similar to the inithook this hook allows to insert code for the
 * initialization of devices.
 * 
 * ###signatures### (optional)
 * This hook is replaced by the signatures of all defined operations.
 */


var ReservedWords = {};


ReservedWords.check = function(text) {
    var myRegExp = new RegExp(".*," + text+ ",.*", 'i');
    return this.list.match(myRegExp);
}

/**
 * A simple constructor setting the default values.
 */

AbbozzaGenerator = function() {
  this.serialRequired = false;
  this.parserRequired = false;
  // this.preSetup = "";
  this.libraries = [];
  this.setupHookCode = "";
  this.startMonitor = false;
  this.codeTemplate = "";
};

/**
 * Initialize the generator
 * 
 * @returns {undefined}
 */
AbbozzaGenerator.prototype.init = function() {
   
   var generator = this;
   
   // Find teh code template
   Connection.getText("js/abbozza/" + Abbozza.systemPrefix + "/code_template",
     function(text) {
       generator.codeTemplate = text;
       // console.log("abbozza! : Code Template found!")
     }, 
     function(text) {
       console.log("abbozza! : No code Template found at js/abbozza/" + Abbozza.systemPrefix + "/code_template !")         
     }) 
};

/**
 * This operation generates the code, based on the code template
 * 
 * @param {type} opt_workspace
 * @returns {undefined}
 */
AbbozzaGenerator.prototype.workspaceToCode = function(opt_workspace) {
    // Clear all errors
    ErrorMgr.clearErrors();
    
    // Set the common options and initialize generation process
    this.startGenerator = false;
    
    // call the system specific initialization
    if ( this.initGenerator_ != "undefined" ) this.initGenerator_();
    
    // Initialize code snippets
    this.preSetup = "// preSetup is DEPRECATED!";
    this.setupHookCode = "";
    this.setupHookCodeAdd = ""; // Additonal appended to the setup hook
    this.initHookCode = "";
    this.definesCode = "";
    this.libraries = [];
    this.signatureCode = "";
    this.blockCode = "";
    this.mainCode = "";
    this.deviceCode = "";
    this.globalVarCode = "";
    
    // Start with the code template
    var code = this.codeTemplate;
    
    // Set the workspace as local variable
    var workspace = opt_workspace || Blockly.mainWorkspace;
    
    // Get all top blocks from workspace
    var origBlocks = workspace.getTopBlocks(true);
    
    /**
     * Rearrange the top blocks:
     * blocks[0] : device block if present
     * blocks[1] : main block
     * blocks[i] : function declarations
     * 
     * Initialize device and main block by null.
     */
    var blocks = [null, null];
    for (var i = 0; i < origBlocks.length; i++) {
        block = origBlocks[i];
        // Device block
        if (block.type == "devices") {
            blocks[0] = block;
        } else if (block.type.startsWith("main")) {
            // The main block
            blocks[1] = block;
        } else if ((block.type == "func_decl") || (block.type == "int_isr") || block.type.startsWith("event_isr_") ) {
            blocks.push(block);
        }
    }

    // Iterate backward through the blocks and generate the code
    // The main block is treated last, since the isr blocks are scanned for
    // the usage of global variables, which have to be declared "volatile"
    for (var x = blocks.length-1; x >= 0; x--) {
      var block = blocks[x];
      if ( block ) {  // catching missing device block
        var line = this.topBlockToCode(block, "");
        if (line) {
          // Seperate operation blocks
          if ( (block.type == "func_decl") || (block.type == "int_isr")  || (block.type.startsWith("event_isr_")) ) {
            this.signatureCode = this.signatureCode + block.getSignature() + ";\n";  
            this.blockCode = this.blockCode + line;
          } else if (block.type == "devices") {
            this.deviceCode = this.deviceCode + line;                    
          } else {
            this.mainCode = this.mainCode + line;
          }
        }
      }
    }
    
    // call the system specific initialization
    if ( this.checkOptions_ != "undefined" ) this.checkOptions_();

    // Replace the first hooks
    code = code.replace(/###globalvars###/g, this.globalVarCode);
    code = code.replace(/###blocks###/g, this.blockCode);
    code = code.replace(/###devices###/g, this.deviceCode);
    code = code.replace(/###signatures###/g, this.signatureCode);
    code = code.replace(/###defines###/g, this.definesCode);
    code = code.replace(/###libraries###/g, this.getLibrariesCode());
    
    code = code.replace(/###inithook###/g, this.initHookCode);
    
    // The setup hook code is inside an operation. Hence, it has to 
    // be indented
    if ( this.setupHookCodeAdd != "" ) {
      this.setupHookCode = this.setupHookCode + "\n" + this.setupHookCodeAdd + "\n";
    }    
    this.setupHookCode = this.setupHookCode.replace(/\n/g,"\n   ");
    this.setupHookCode = this.setupHookCode + "\n";
    if ( !this.setupHookCode.startsWith("   ") ) this.setupHookCode = "   " + this.setupHookCode;
    code = code.replace(/###setuphook###/g, this.setupHookCode);

    // The main code is inside an operation. Hence, it has to 
    // be indented
    this.mainCode = this.mainCode.replace(/\n/g,"\n   ");
    this.mainCode = this.mainCode + "\n";
    if ( !this.mainCode.startsWith("   ") ) this.mainCode = "   " + this.mainCode;
    code = code.replace(/###main###/g, this.mainCode);

    // Scrub Whitespaces
    code = code.replace(/^\s+\n/, '');
    code = code.replace(/\n\s+$/, '\n');
    code = code.replace(/[ \t]+\n/g, '\n');
    // this .workspaceToCode_(workspace);
    
    return code;
}

/**
 * This method checks if the block has a method called generateCode.
 * If this is the case, it is called for code generation.
 * 
 * If the method does not exist, the corresponding entry of AbbozzaCode is
 * used. Each entry is an array with the following entries:
 * 
 * 0 : The code template, using "#" as positions for replacements.
 *     Alternatively a function returning the generated code. It is called on
 *     the corresponding block with the generator as argument.
 * 1 : An array describing the replacements ordered by appearance in the 
 *     template
 * 2 : A function called for code generation. It is executed by the block
 *     and the generator is given as its only parameter.
 * 
 * Each description of an replacement in [1] can be of one of the following
 * types:
 * 
 * "V_NAME" : The replacement is the code generated by the value at the 
 *            blocks ValueInput NAME. If a certain type has to be enforced,
 *            it is added as third part: V_NAME_TYPE
 *            
 * "F_NAME" : The replacement is the code generated by the value at the 
 *            blocks FieldValue NAME.
 *            
 * "S_NAME" : The replacement is the code generated by the value at the 
 *            blocks Statement input NAME
 *            
 * "K_NAME" : The replacement is the code given by the __keyword entry "NAME"
 *            
 * function : The replacement is returned by the given function, which is
 *            executed on the blocj, with the generator as its single parameter
 */
AbbozzaGenerator.prototype._toCode = function(block) {
    if (block.generateCode) return block.generateCode(this);
    
    if (AbbozzaCode[block.type]) {
        // Check if the entry is afunction
        if ( typeof AbbozzaCode[block.type] == "function" ) {
            // call the function with block as this and this generator as single 
            // argument.
            var generatingFunc = AbbozzaCode[block.type];
            return generatingFunc.call(block,this); 
        }
        // Get the template
        var code = AbbozzaCode[block.type][0];
        var values = AbbozzaCode[block.type][1];
        var func = null;
        if ( AbbozzaCode[block.type].length == 3 ) {
            func = AbbozzaCode[block.type][2];
            if ( typeof func == "function") {
                func.call(block,this);
            }
        }
        if (values) {
            // Iterate through values
            for (var i = 0; i < values.length ; i ++ ) {
                // Check type of value
                var replacement = "";
                if ( typeof values[i] == "function") {
                    replacement = values[i].call(block,this);
                } else if (typeof values[i] == "string") {
                    var name = values[i].substring(2);
                    if ( values[i].match(/^F_.*/) ) {
                       replacement = this.fieldToCode(block,name);
                    } else if ( values[i].match(/^V_.*/) ) {
                      var type = null;
                       // Check for enforced type
                       if ( name.match(/.*_.*/) ) {
                           var tokens = name.split("_");
                           type = tokens[1];
                           name = tokens[0];
                       }
                       replacement = this.valueToCode(block,name,type);
                    } else if ( values[i].match(/^S_.*/) ) {
                       replacement = this.statementToCode(block,name,"   ");
                    } else if ( values[i].match(/^K_.*/) ) {
                        replacement = keyword(name);
                    }
                } else {
                    replacement = "";
                }
                if (replacement == null ) replacement ="";
                repPos = code.indexOf("#");
                if ( (repPos > 0) && ( repPos < code.length-1) && 
                    ( code.charAt(repPos-1) == "(" ) && ( code.charAt(repPos+1) == ")" )) {
                    // check if replacement has parantheses
                    if ( (replacement.charAt(0) == "(") && ((replacement.charAt(replacement.length-1) == ")"))) {
                        code = code.replace(/\(#\)/,replacement);
                    } else {
                        code = code.replace(/#/,replacement);                        
                    }
                } else {
                    code = code.replace(/#/,replacement);
                }
            }
        }   
        return(code);
    } else {
        return "";
    }
}


/**
 * Add a required library. The operation checks if the library was added befor
 * 
 * @param {type} lib The library to be added
 * @returns {undefined}
 */
AbbozzaGenerator.prototype.addLibrary = function(lib) {
        for (var i = 0; i < this.libraries.length; i++ ) {
            if (this.libraries[i] == lib) return;
        }
	this.libraries.push(lib);
}


/**
 * Returns the string containg all library imports.
 * The standard version produces the standard C-Syntax:
 * #include <lib>
 * 
 * The code is an empty string if no library has to be imported. Otherwise
 * it ends with a newline.
 * 
 * This operation has to be overrideen if another syntax is required.
 * 
 * @returns {undefined}
 */
AbbozzaGenerator.prototype.getLibrariesCode = function() {
  var code = "";
  if (this.libraries.length != 0 ) {
    for (var i = 0; i < this.libraries.length; i++) {
      code = code + "#include <" + this.libraries[i] + ">\n";
    }
    code = code + "\n";
  } 
  return code;
}


/**
 * Add one or more lines of pre setup code
 * 
 * @param {type} line
 * @returns {undefined}
 */
AbbozzaGenerator.prototype.addPreSetup = function(line) {
    console.err("AbbozzaGenerator.addPreSetup is DEPRECATED!!");
    this.addInitCode(line);
}

/**
 * Add on or more lines to the defines.
 * 
 * @param {type} line The line(s) to be added.
 * @returns {undefined}
 */
AbbozzaGenerator.prototype.addDefinesCode = function(line) {
    // add the line if it isn't contained already.
    if ( this.definesCode.indexOf(line) == -1 ) {
        if ( this.definesCode != "" ) {
            this.definesCode = this.definesCode +"\n";
        }
        this.definesCode = this.definesCode + line;
    }
}

/**
 * Add on or more lines of code for setup.
 * 
 * @param {type} line The line(s) to be added.
 * @returns {undefined}
 */
AbbozzaGenerator.prototype.addSetupCode = function(line, prepend = false) {
    // add the line if it isn't contained already.
    if ( this.setupHookCode.indexOf(line) == -1 ) {
        if ( !prepend ) {
          if ( this.setupHookCode != "" ) {
            this.setupHookCode = this.setupHookCode +"\n";
          }
          this.setupHookCode = this.setupHookCode + line;
      } else {
          if ( this.setupHookCode != "" ) {
            this.setupHookCode = "\n" + this.setupHookCode;
          }
          this.setupHookCode = line + this.setupHookCode;          
      }
    }
}

/**
 * Add on or more lines of code in setup(). It is check of the same
 * code was added before.
 * 
 * @param {type} line The line(s) to be added
 * 
 * @returns {undefined}
 */
AbbozzaGenerator.prototype.addInitCode = function(line, prepend = false) {
    // add the line if it isn't contained already.
    if ( this.initHookCode.indexOf(line) == -1 ) {
      if ( !prepend ) {
         if ( this.initHookCode != "" ) {
            this.initHookCode = this.initHookCode + "\n";
         }
        this.initHookCode = this.initHookCode + line;
      } else {
        if ( this.initHookCode != "" ) {
            this.initHookCode = "\n" + this.initHookCode;
        }
        this.initHookCode = line + this.initHookCode;        
      }
    }
}


/**
 * This operation generates the code of a top block.
 * It adds multi- and single-line comments before the code.
 */
AbbozzaGenerator.prototype.topBlockToCode = function(block) {
    
	var code = this._toCode(block);
        
        // Add a block comment before the generated code
	var comment = block.getCommentText();
	if ( comment.indexOf('\n') != -1 ) {
		comment = "/**\n * " + comment.replace(/\n/g,"\n * ");
		comment = comment + "\n */\n";
		code = comment + code + "\n";
	} else {
		// One comment line
 		if ( (comment != null) && (comment != "") ) {
 			comment = "// " + comment + "\n";
 		} else comment = "";
	 	code = comment +  code;
	}
 	return code;
}


/**
 * This operation generates the code for the given block.
 */
AbbozzaGenerator.prototype.blockToCode = function(block) {
    
        // Call the blocks code generation operation
	var code = this._toCode(block);
        
        // Add a block comment before the generated code
	var comment = block.getCommentText();
	if ( comment.indexOf('\n') != -1 ) {
		comment = "/**\n * " + comment.replace(/\n/g,"\n * ");
		comment = comment + "\n */\n";
		code = comment + code + "\n";
	} else {
		// One comment line
 		if ( (comment != null) && (comment != "") ) {
 			comment = "\t// " + comment + "\n";
 		} else comment = "";
	 	code = comment +  code;
	}
	
	return code;
}

/**
 * Generates a string of symbols of the form
 * <symbol> <seperator> <symbol> <separator> ... <symbol>
 * 
 * <separator> = "," for parameters
 * <separator> = "" for local variables
 */
AbbozzaGenerator.prototype.symbolsToCode = function(symbols, separator, prefix) {
    var comment;
    var pars = "";
    if (symbols.length > 0) {
        if (symbols.length == 1) separator = "";
        pars = this.symbolToCode(symbols[0]);
        comment = symbols[0][4];
        if (comment && comment != "" ) {
            code = code + separator + "\t//" + comment.replace(/\n/g, " ");
        }    
        for ( var i=1; i < symbols.length; i++) {
            if ( i == symbols.length - 1) separator = "";
            comment = symbols[i][4];
            pars = pars + separator + "\t//"  + comment.replace(/\n/g, " ")
                    + this.symbolToCode(symbols[i]);
        }
    } else {
        return "";
    }
}


/**
 * This operation generates the code of a sequence of statements connected to
 * 'block' at the input 'name'. 'prefix' is added to the beginning of each line. 
 */
AbbozzaGenerator.prototype.statementToCode = function(block, name, prefix) {
	var code = "";
        
        // Iterate through all statements
	var current = block.getInputTargetBlock(name);
        if (!current) return "";
	while (current) {
		var line = this.blockToCode(current);
		if ( line )
			code = code + line + "\n";
		current = current.getNextBlock();
	}
        // Add the prefix in front of the first line
        // and replace each newline by newline + prefix
	code = prefix + code;
	code = code.replace(/\n$/g,"");
	code = code.replace(/\n/g,"\n"+prefix);
        
	return code;
}

/**
 * This operation generates the code of a block connected to the
 * input <name> of the given <block>. It adds a type cast if opt_enforcedType
 * is given. null is returned, if input the input does not exist or no block
 * is connected to it. In this case an error is set.
 */
AbbozzaGenerator.prototype.valueToCode = function(block,name,opt_enforcedType) {
    
    if ( block.getInput(name) == null ) {
	ErrorMgr.addError(block, _("err.NOINPUT"));
	return null;
    }
    var target = block.getInputTargetBlock(name);
		
    if ( target == null ) {
	ErrorMgr.addError(block,_("err.EMPTYINPUT"));
	return null;
    }
	
    var code = this._toCode(target);
    if ( opt_enforcedType ) {
        // Fetch the type of the output of target
        // var output = target.outputConnection;
        // if ( output.check_ != opt_enforcedType ) {
        var type = this.getTypeOfValue(block,name);
        if ( type != opt_enforcedType )
            code = this.enforceType(code,opt_enforcedType);
        // }
    }
	
    return code;
}



/**
 * This operation generates the code from a value input of a given block.
 * The type of the code is not checked.
 * 
 * block: The block whose code has to be generated
 * name: The name of the value input
 * defaultVal: The default value to be returned, if the input does not produce code.
 */
AbbozzaGenerator.prototype.valueToCodeUnchecked = function(block,name,defaultVal) {

    // Return the default value, if the input doesn't exist
    if ( block.getInput(name) == null ) {
	return defaultVal;
    }

    // Get the block connected to the input
    var target = block.getInputTargetBlock(name);

    // If it doesn't exist, return the default value
    if ( target == null ) {
        return defaultVal;
    }

    // Return the blocks code.
    return this._toCode(target);
}

/**
 * This operation returns the code generated by the field <name>. 
 * If the field doesn't exist or contains a placeholder ( <default>,
 * <name> or ???), it sets an error.
 */
AbbozzaGenerator.prototype.fieldToCode = function(block,name) {
    var content = block.getFieldValue(name);
    if (content == null )
        ErrorMgr.addError(block,_("err.NOVALUE"));
    if ( (content == "<default>") || ( content == "???") || (content == "<name>") ) 
        ErrorMgr.addError(block,_("err.DEFAULT_VALUE"));     
    if ( content == "<illegalanalogpin>") 
        ErrorMgr.addError(block,_("err.ILLEGAL_ANALOG_PIN"));
    return keyword(content);
}

/**
 * This operation retreives the type of a value input.
 */
AbbozzaGenerator.prototype.getTypeOfValue = function(block,name) {
	if ( block.getInput(name) == null ) {
	    ErrorMgr.addError(block,_("err.NOVALUE"));
	    return null;
	}
	var target = block.getInputTargetBlock(name);
	
	if ( target == null ) {
	    ErrorMgr.addError(block,_("err.EMPTYVALUE"));
	    return null;
	}
	
	var check = target.outputConnection.check_;
	if (!goog.isArray(check)) {
           check = [check];
	}
	for ( var i = 0; i < check.length; i++) {
	    if ( (check[i] == "NUMBER") || (check[i] == "STRING") || (check[i] == "TEXT")|| (check[i] == "DECIMAL")  || (check[i] == "BOOLEAN")) {
	       return check[i];
            }
	}
	return check[0];
}


/**
 * Naked values are top-level blocks with outputs that aren't plugged into
 * anything.  A trailing semicolon is needed to make this legal.
 * @param {string} line Line of generated code.
 * @return {string} Legal line of code.
 */
AbbozzaGenerator.prototype.scrubNakedValue = function(line) {
  return line + ';\n';
};


/**
 * Encode a string as a properly escaped JavaScript string, complete with
 * quotes.
 * @param {string} string Text to encode.
 * @return {string} JavaScript string.
 * @private
 */
AbbozzaGenerator.prototype.quote_ = function(string) {
  // TODO: This is a quick hack.  Replace with goog.string.quote
  string = string.replace(/\\/g, '\\\\')
                 .replace(/\n/g, '\\\n')
                 .replace(/'/g, '\\\'');
  return '\'' + string + '\'';
};


/**
 * Common tasks for generating JavaScript from blocks.
 * Handles comments for the specified block and any connected value blocks.
 * Calls any statements following this block.
 * @param {!Block} block The current block.
 * @param {string} code The JavaScript code created for this block.
 * @return {string} JavaScript code with comments and subsequent blocks added.
 * @private
 */
AbbozzaGenerator.prototype.scrub_ = function(block, code) {
  var commentCode = '';
  // Only collect comments for blocks that aren't inline.
  if (!block.outputConnection || !block.outputConnection.targetConnection) {
    // Collect comment for this block.
    var comment = block.getCommentText();
    if (comment) {
      commentCode += this.prefixLines(comment, '// ') + '\n';
    }
    // Collect comments for all value arguments.
    // Don't collect comments for nested statements.
    for (var x = 0; x < block.inputList.length; x++) {
      if (block.inputList[x].type == Blockly.INPUT_VALUE) {
        var childBlock = block.inputList[x].connection.targetBlock();
        if (childBlock) {
          var comment = this.allNestedComments(childBlock);
          if (comment) {
            commentCode += this.prefixLines(comment, '// ');
          }
        }
      }
    }
  }
  var nextBlock = block.nextConnection && block.nextConnection.targetBlock();
  var nextCode = this.blockToCode(nextBlock);
  return commentCode + code + nextCode;
};


AbbozzaGenerator.prototype.combine = function(text,args) {
	var pattern;
	for ( var i = 0 ; i < args.length ; i++ ) {
		pattern = "/#" + i + "/g";
		text.replace(pattern,args[i]);
		console.log(pattern);
	}
	return text;
}


AbbozzaGenerator.prototype.checkSystem = function(block, system) {
    if ( system instanceof Array ) {
        if ( system.indexOf(Abbozza.systemPrefix) == -1 ) {
            ErrorMgr.addError(block,_("err.INCOMPATIBLE_SYSTEM"));            
        }
    } else {
        if ( system != Abbozza.systemPrefix) {
            ErrorMgr.addError(block,_("err.INCOMPATIBLE_SYSTEM"));
        }
    }
}


AbbozzaGenerator.prototype.setError = function (block, text) {
	console.log("AbbozzaGenerator.setError deprecated");
}

AbbozzaGenerator.prototype.typeList = function() {
	return [[_("VOID"),"VOID"],[_("NUMBER"),"NUMBER"],[_("STRING"),"STRING"],[_("DECIMAL"),"DECIMAL"],[_("BOOLEAN"),"BOOLEAN"]];
}


/**
 * This operation retrieves the correct keyword described by an abbozza! label.
 */
keyword = function(tag) {
	for (var i = 0; i < __keywords.length; i++) {
		if ( __keywords[i][0] == tag ) 
		return __keywords[i][1];
	}
	return tag;
}

setKeyword = function(key,word) {
    for (var i = 0; i < __keywords.length; i++) {
	if ( __keywords[i][0] == key ) {
            __keywords[i][1] = word;
        }
    }
}