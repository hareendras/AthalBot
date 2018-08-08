"use strict";
const axios = require("axios");
const dialogflow = require("dialogflow");
const NineGag = require("9gag");
const Scraper = NineGag.Scraper;
const {
  FB_GRAPH_URL,
  FB_PG_ACCESS_TOKEN,
  DF_PROJECT_ID  
} = require("./config");

const languageCode = "en-US"; // for DF
// Imports dependencies and set up http server
const express = require("express"),
  bodyParser = require("body-parser"),
  app = express().use(bodyParser.json()); // creates express http server
let posts = [],
  i = 1;

// Creates the endpoint for our webhook
app.post("/webhook", (req, res) => {
  let body = req.body;
  //  console.log(body);
  // Checks this is an event from a page subscription
  if (body.object === "page") {
    // Iterates over each entry - there may be multiple if batched
    body.entry.forEach(async function(entry) {
      let webhook_event = entry.messaging[0];
      let senderId = webhook_event.sender.id;
      let message = webhook_event.message.text;

      //console.log(senderId, message);
      let fbSendMsgUrl = `${FB_GRAPH_URL}me/messages?access_token=${FB_PG_ACCESS_TOKEN}`;
      let fbMessageAttachUrl = `${FB_GRAPH_URL}me/message_attachments?access_token=${FB_PG_ACCESS_TOKEN}`;
      const sessionClient = new dialogflow.SessionsClient();
      // Define session path
      const sessionPath = sessionClient.sessionPath(DF_PROJECT_ID, DF_PROJECT_ID);

      // The text query request.
      const request = {
        session: sessionPath,
        queryInput: {
          text: {
            text: message,
            languageCode: languageCode
          }
        }
      };
      // Send request and log result
      try {
        let messageToUser = "";
        let responses = await sessionClient.detectIntent(request);
        const result = responses[0].queryResult;
        i === 0 ? (i = 1) : (i = 0);
        let category = ["trending", "hot"];
        //  console.log(`  Query: ${result.queryText}`);
        //  console.log(`  Response: ${result.fulfillmentText}`);
        messageToUser = result.fulfillmentText;
        console.log("MSG TO USER ", messageToUser);
        if (result.intent) {
          console.log(`  Intent: ${result.intent.displayName}`);
          if (result.intent.displayName === "joke") {
            console.log("Intent JOKE");

            if (posts === undefined || posts.length == 0) {
              const scraper = new Scraper(30, category[i], 0);
              let results = await scraper.scrap();
              posts = results.reduce((out, item) => {
                out.push({
                  id: item.id,
                  title: item.title,
                  content: item.content,
                  type: item.type
                });
                return out;
              }, []);
            }
            let thePost = posts.pop();
            //   console.log(posts[rand]);
            await sendTextMessageToUser(fbSendMsgUrl, senderId, thePost.title);

            await sendTypingOnOff(fbSendMsgUrl, senderId, "typing_on");
            //attach randomly slelected post to FB
            let attach_id = await attachToFB(
              fbMessageAttachUrl,
              thePost.type,
              thePost.content
            );

            let response = await sendMediaToUser(
              fbSendMsgUrl,
              senderId,
              thePost.type,
              attach_id.data.attachment_id
            );
            await sendTypingOnOff(fbSendMsgUrl, senderId, "typing_off");
          } else {
            let response = await sendTextMessageToUser(
              fbSendMsgUrl,
              senderId,
              messageToUser
            );
          }
        } else {
          let response = await sendTextMessageToUser(
            fbSendMsgUrl,
            senderId,
            messageToUser
          );
        }
      } catch (err) {
        console.log("Error => ", err);
      }
    });

    // Returns a '200 OK' response to all requests
    res.status(200).send("EVENT_RECEIVED");
  } else {
    // Returns a '404 Not Found' if event is not from a page subscription
    res.sendStatus(404);
  }
});

function sendTextMessageToUser(fbSendMsgUrl, senderId, messageToUser) {
  console.log("SEND MESSAGE TO USER+> ", senderId);
  if (messageToUser === "") return Promise.reject("Blank message passed");
  return axios.post(fbSendMsgUrl, {
    messaging_type: "RESPONSE",
    recipient: {
      id: senderId
    },
    message: {
      text: messageToUser
    }
  });
}

function sendTypingOnOff(fbSendMsgUrl, senderId, onOff) {
  return axios.post(fbSendMsgUrl, {
    messaging_type: "RESPONSE",
    recipient: {
      id: senderId
    },
    sender_action: onOff
  });
}

function sendMediaToUser(fbSendMsgUrl, senderId, messageType, attachment_id) {
  console.log("SEND MEDIA TO USER +> ", senderId);
  return axios.post(
    fbSendMsgUrl,
    JSON.stringify({
      recipient: {
        id: senderId
      },
      message: {
        attachment: {
          type: "template",
          payload: {
            template_type: "media",
            elements: [
              {
                media_type: messageType,
                attachment_id: attachment_id
              }
            ]
          }
        }
      }
    }),
    {
      headers: {
        "Content-Type": "application/json"
      }
    }
  );
}

function attachToFB(fbMessageAttachUrl, messageType, resUrl) {
  console.log("CALLING ATTACHFB");
  return axios.post(
    fbMessageAttachUrl,
    {
      message: {
        attachment: {
          type: messageType,
          payload: {
            is_reusable: true,
            url: resUrl
          }
        }
      }
    },
    {
      headers: {
        "Content-Type": "application/json"
      }
    }
  );
}

// Adds support for GET requests to our webhook
app.get("/webhook", (req, res) => {
  // Your verify token. Should be a random string.
  let VERIFY_TOKEN = "athalBot";

  // Parse the query params
  let mode = req.query["hub.mode"];
  let token = req.query["hub.verify_token"];
  let challenge = req.query["hub.challenge"];
  console.log(mode, token, challenge);
  // Checks if a token and mode is in the query string of the request
  if (mode && token) {
    // Checks the mode and token sent is correct
    if (mode === "subscribe" && token === VERIFY_TOKEN) {
      // Responds with the challenge token from the request
      console.log("WEBHOOK_VERIFIED");
      console.log("CHALLENGE", challenge);
      res.status(200).send(challenge);
    } else {
      // Responds with '403 Forbidden' if verify tokens do not match
      res.sendStatus(403);
    }
  }
});

// Sets server port and logs message on success
app.listen(process.env.PORT || 1337, () => console.log("webhook is listening"));
