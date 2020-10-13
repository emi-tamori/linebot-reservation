const express = require('express');
const app = express();
const line = require('@line/bot-sdk');//@line/bot-sdk読み込み
const { Client } = require('pg');//pgライブラリ読み込み
const PORT = process.env.PORT || 5000
const INITIAL_TREAT = [20,10,40,15,30,15,10];  //施術時間初期値
const config = {
    channelAccessToken:process.env.ACCESS_TOKEN,
    channelSecret:process.env.CHANNEL_SECRET
};

const client = new line.Client(config);
//Postgresを使うためのパラメータ初期設定
const connection = new Client({
    user:process.env.PG_USER,
    host:process.env.PG_HOST,
    database:process.env.PG_DATABASE,
    password:process.env.PG_PASSWORD,
    port:5432
});
connection.connect();//connectionを使ってデーターベース操作を行えるようになる

//顧客データーベースク作成
const create_userTable = {
    text:'CREATE TABLE IF NOT EXISTS users (id SERIAL NOT NULL, line_uid VARCHAR(255), display_name VARCHAR(255), timestamp VARCHAR(255), cuttime SMALLINT, shampootime SMALLINT, colortime SMALLINT, spatime SMALLINT);'
}
//顧客データーベースクエリ実行
connection.query(create_userTable)
.then(()=>{
    console.log('table users created successfully!!');
})
.catch(e=>console.log(e));

app
.post('/hook',line.middleware(config),(req,res)=> lineBot(req,res))
.listen(PORT,()=>console.log(`Listening on ${PORT}`));

//lineBot関数
const lineBot = (req,res) => {
    res.status(200).end();
    const events = req.body.events;
    const promises = [];
    for(let i=0;i<events.length;i++){
        const ev = events[i];
        switch(ev.type){
            case 'follow':
                promises.push(greeting_follow(ev));
                break;
            case 'message':
                promises.push(handleMessageEvent(ev));
                break;
            case 'postback':
                promises.push(handlePostbackEvent(ev));
                break;
    }   
}
Promise
.all(promises)
.then(console.log('all promises passed'))
.catch(e=>console.error(e.stack));
}

//orderChoice()
const orderChoice = (ev) => {
    return client.replyMessage(ev.replyToken,{
        "type":"flex",
        "altText":"menuSelect",
        "contents":
        {
            "type": "bubble",
            "header": {
              "type": "box",
              "layout": "vertical",
              "contents": [
                {
                  "type": "text",
                  "text": "メニューを選択してください",
                  "size": "lg",
                  "align": "center"
                }
              ]
            },
            "hero": {
              "type": "box",
              "layout": "vertical",
              "contents": [
                {
                  "type": "text",
                  "text": "（１つのみ選択してください）",
                  "size": "md",
                  "align": "center"
                },
                {
                  "type": "separator"
                }
              ]
            },
            "body": {
              "type": "box",
              "layout": "vertical",
              "contents": [
                {
                  "type": "box",
                  "layout": "horizontal",
                  "contents": [
                    {
                      "type": "button",
                      "action": {
                        "type": "postback",
                        "label": "カット",
                        "data": "menu&0"
                      },
                      "margin": "md",
                      "style": "primary",
                      "color": "#999999"
                    },
                    {
                      "type": "button",
                      "action": {
                        "type": "postback",
                        "label": "シャンプー",
                        "data": "menu&1"
                      },
                      "margin": "md",
                      "style": "primary",
                      "color": "#999999"
                    }
                  ],
                  "margin": "md"
                },
                {
                  "type": "box",
                  "layout": "horizontal",
                  "contents": [
                    {
                      "type": "button",
                      "action": {
                        "type": "postback",
                        "label": "カラーリング",
                        "data": "menu&2"
                      },
                      "margin": "md",
                      "style": "primary",
                      "color": "#999999"
                    },
                    {
                      "type": "button",
                      "action": {
                        "type": "postback",
                        "label": "ヘッドスパ",
                        "data": "menu&3"
                      },
                      "margin": "md",
                      "style": "primary",
                      "color": "#999999"
                    }
                  ],
                  "margin": "md"
                },
                {
                  "type": "box",
                  "layout": "horizontal",
                  "contents": [
                    {
                      "type": "button",
                      "action": {
                        "type": "postback",
                        "label": "マッサージ＆スパ",
                        "data": "menu&4"
                      },
                      "margin": "md",
                      "style": "primary",
                      "color": "#999999"
                    },
                    {
                      "type": "button",
                      "action": {
                        "type": "postback",
                        "label": "顔そり",
                        "data": "menu&5"
                      },
                      "margin": "md",
                      "style": "primary",
                      "color": "#999999"
                    }
                  ],
                  "margin": "md"
                },
                {
                  "type": "box",
                  "layout": "horizontal",
                  "contents": [
                    {
                      "type": "button",
                      "action": {
                        "type": "postback",
                        "label": "眉整え",
                        "data": "menu&6"
                      },
                      "margin": "md",
                      "style": "primary",
                      "color": "#999999"
                    },
                    {
                      "type": "button",
                      "action": {
                        "type": "postback",
                        "label": "選択終了",
                        "data": "end"
                      },
                      "margin": "md",
                      "style": "primary",
                      "color": "#0000ff"
                    }
                  ],
                  "margin": "md"
                }
              ]
            },
            "footer": {
              "type": "box",
              "layout": "vertical",
              "contents": [
                {
                  "type": "button",
                  "action": {
                    "type": "postback",
                    "data": "cancel",
                    "label": "キャンセル"
                  }
                }
              ]
            }
          }
    });
}
//handleMessageEvent()
const handleMessageEvent = async (ev) => {
    console.log('ev:',ev);
    const profile = await client.getProfile(ev.source.userId);
    const text = (ev.message.type === 'text') ? ev.message.text : '';

    if(text === '予約する'){
        orderChoice(ev);
    }else{
        return client.replyMessage(ev.replyToken,{
            "type":"text",
            "text":`${profile.displayName}さん、今${text}って言いました？`
        });
    }
}

//greeting_follow()
const greeting_follow = async (ev) => {
    const profile = await client.getProfile(ev.source.userId);

    const table_insert = {
        text:'INSERT INTO users (line_uid,display_name,timestamp,cuttime,shampootime,colortime,spatime) VALUES($1,$2,$3,$4,$5,$6,$7);',
        values:[ev.source.userId,profile.displayName,ev.timestamp,INITIAL_TREAT[0],INITIAL_TREAT[1],INITIAL_TREAT[2],INITIAL_TREAT[3]]   
    };
    connection.query(table_insert)
    .then(()=>{
        console.log('insert successfully!!')
    })
    .catch(e=>console.log(e));
   
    return client.replyMessage(ev.replyToken,{
        "type":"text",
        "text":`${profile.displayName}さん、フォローありがとうございます\uDBC0\uDC04`
    });
}

//handlePostbackEvent()
const handlePostbackEvent = async (ev) => {
    const profile = await client.getProfile(ev.source.userId);
    const data = ev.postback.data;
    const splitData = data.split('&');

    if(splitData[0] === 'menu'){
        const orderedMenu = splitData[1];
        askDate(ev,orderedMenu);
    }
}

//askDate()
const askDate = (ev,orderedMenu) => {
    return client.replyMessage(ev.replyToken,{
        "type":"flex",
        "altText":"予約日選択",
        "contents":
        {
            "type": "bubble",
            "body": {
              "type": "box",
              "layout": "vertical",
              "contents": [
                {
                  "type": "text",
                  "text": "来店希望日を選んでください。",
                  "size": "md",
                  "align": "center"
                }
              ]
            },
            "footer": {
              "type": "box",
              "layout": "vertical",
              "contents": [
                {
                  "type": "button",
                  "action": {
                    "type": "datetimepicker",
                    "label": "希望日を選択する",
                    "data": "date&${orderedMenu}",
                    "mode": "date"
                  }
                }
              ]
            }
          }
    });
}