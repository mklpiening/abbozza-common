/**
 * @license
 * abbozza!
 *
 * Copyright 2015 Michael Brinkmeier ( michael.brinkmeier@uni-osnabrueck.de )
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
 * @fileoverview ...
 * @author michael.brinkmeier@uni-osnabrueck.de (Michael Brinkmeier)
 */
package de.uos.inf.did.abbozza.handler;

import com.sun.net.httpserver.HttpExchange;
import de.uos.inf.did.abbozza.core.AbbozzaLogger;
import de.uos.inf.did.abbozza.core.AbbozzaServer;
import de.uos.inf.did.abbozza.monitor.AbbozzaMonitor;
import de.uos.inf.did.abbozza.monitor.Message;
import de.uos.inf.did.abbozza.monitor.clacks.ClacksMessage;
import de.uos.inf.did.abbozza.monitor.clacks.ClacksRequest;
import java.io.IOException;
import java.io.StringReader;
import java.net.URLDecoder;
import java.util.Properties;

/**
 *
 * @author michael
 */
public class SerialHandler extends AbstractHandler {

    public SerialHandler(AbbozzaServer abbozza) {
        super(abbozza,true);
        AbbozzaLogger.out("SerialHandler registered",AbbozzaLogger.DEBUG);
    }
    
    @Override
    protected void handleRequest(HttpExchange he) throws IOException {
        String query = he.getRequestURI().getQuery();
        // msg=<msg>&timeout=<time>
        // No timeout means that the request is not waitung
        AbbozzaLogger.debug("SerialHandler: received " + he.getRequestURI().toString());
        query = URLDecoder.decode(query,"UTF-8");
        // query = query.replace("%20"," ");
        query = query.replace('&', '\n');
        Properties props = new Properties();
        props.load(new StringReader(query));
        AbbozzaLogger.debug("SerialHandler: msg = " + props.get("msg"));
        AbbozzaLogger.debug("SerialHandler: timeout = " + props.get("timeout"));
        long timeout = 0;
        if ( props.get("timeout") != null ) {
            timeout = Long.parseLong((String) props.get("timeout"));
        }
        AbbozzaMonitor monitor = this._abbozzaServer.getMonitor();
        if ( monitor != null ) {
           ClacksRequest msg = monitor.getClacksService().processRequest((String) props.get("msg"), he, this, timeout);
           while ( msg.getState() == Message.WAITING ) {
              try {
                  Thread.sleep(100);
              } catch (InterruptedException ex) {
              }
           }
           switch ( msg.getState() ) {
               case Message.DONE:
                    AbbozzaLogger.out("SerialHandler: message sent");
                    sendResponse(he, 200, "text/plain", "ok"); 
                    break;
               case Message.TIMEDOUT:
                    AbbozzaLogger.out("SerialHandler: message timed out");
                    sendResponse(he, 400, "text/plain", "query timed out!"); 
                    break;
               case Message.RESPONSE_READY:
                    AbbozzaLogger.out("SerialHandler: answer : " + msg.getResponse());
                    sendResponse(he, 200, "text/plain", msg.getResponse() ); 
                    break;
           } 
        } else {
           sendResponse(he, 400, "text/plain", "No board listens!"); 
        }
    }
    
}
