const express = require('express');//express読み込み
const app = express();
const line = require('@line/bot-sdk');//@line/bot-sdk読み込み
const { Client } = require('pg');//pgライブラリ読み込み
const PORT = process.env.PORT || 5000
const INITIAL_TREAT = [20,10,40,15,30,15,10];  //施術時間初期値
const WEEK = [ "日", "月", "火", "水", "木", "金", "土" ];//曜日の表示を標準化
const MENU = ['カット','シャンプー','カラーリング','ヘッドスパ','マッサージ＆スパ','眉整え','顔そり'];//メニュー名
const config = {
    channelAccessToken:process.env.ACCESS_TOKEN,
    channelSecret:process.env.CHANNEL_SECRET
};
//現在の日付取得
function getToday (){
  const today = new Date();
  const year = today.getFullYear();//年
  const month = today.getMonth() + 1;//月
  const day = today.getDate(); //日
  const present =  year + ',' + month + ',' + day;
  return present;
  //console.log(present);
}

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

//予約データベースを作成
const create_reservationTable = {
  text:'CREATE TABLE IF NOT EXISTS reservations (id SERIAL NOT NULL, line_uid VARCHAR(255), name VARCHAR(100), scheduledate DATE, starttime BIGINT, endtime BIGINT, menu VARCHAR(50));'
 };
//予約データベースクエリ実行
connection.query(create_reservationTable)
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


//handleMessageEvent関数(イベントタイプ"message"の処理振り分け)
const handleMessageEvent = async (ev) => {
    console.log('ev:',ev);
    const profile = await client.getProfile(ev.source.userId);
    const text = (ev.message.type === 'text') ? ev.message.text : '';

    if(text === '予約する'){
      const nextReservation = await checkNextReservation(ev);
      if(nextReservation.length){
        const startTimestamp = nextReservation[0].starttime;
        const date = dateConversion(startTimestamp);
        const menu = MENU[parseInt(nextReservation[0].menu)];
        return client.replyMessage(ev.replyToken,{
          "type":"text",
          "text":`次回予約は${date}、${menu}でお取りしてます。変更の場合は予約キャンセル後改めて予約をお願いします。`
        });
      }else{
        orderChoice(ev);
      }
    }else if(text === '予約確認'){
      const nextReservation = await checkNextReservation(ev);
      if(typeof nextReservation === 'undefined'){
        return client.replyMessage(ev.replyToken,{
          "type":"text",
          "text":"次回予約は入っておりません。"
        });
      }else if(nextReservation.length){
          const startTimestamp = nextReservation[0].starttime;
        const date = dateConversion(startTimestamp);
        const menu = MENU[parseInt(nextReservation[0].menu)];
        return client.replyMessage(ev.replyToken,{
        "type":"text",
        "text":`次回予約は${date}、${menu}でお取りしてます\uDBC0\uDC22`
        });
      }
      else{
        return client.replyMessage(ev.replyToken,{
          "type":"text",
          "text":"次回予約は入っておりません。"
        });
      }
      
    }else if(text === '予約キャンセル'){
      const nextReservation = await checkNextReservation(ev);
      if(typeof nextReservation === 'undefined'){
        return client.replyMessage(ev.replyToken,{
          "type":"text",
          "text":"次回予約は入っておりません。"
        });
      }else if(nextReservation.length){
        const startTimestamp = parseInt(nextReservation[0].starttime);
        const menu = MENU[parseInt(nextReservation[0].menu)];
        const date = dateConversion(startTimestamp);
        const id = parseInt(nextReservation[0].id);
        return client.replyMessage(ev.replyToken,{
          "type":"flex",
          "altText": "cancel message",
          "contents":
          {
            "type": "bubble",
            "body": {
              "type": "box",
              "layout": "vertical",
              "contents": [
                {
                  "type": "text",
                  "text": `次回の予約は${date}から、${menu}でおとりしてます。この予約をキャンセルしますか？`,
                  "size": "lg",
                  "wrap": true
                }
              ]
            },
            "footer": {
              "type": "box",
              "layout": "horizontal",
              "contents": [
                {
                  "type": "button",
                  "action": {
                    "type": "postback",
                    "label": "予約をキャンセルする",
                    "data": `delete&${id}`
                  }
                }
              ]
            }
          }
        });
      }else{
        return client.replyMessage(ev.replyToken,{
          "type":"text",
          "text":"次回予約は入っておりません。"
        });
      }
    }else{
        return client.replyMessage(ev.replyToken,{
            "type":"text",
            "text":`${profile.displayName}さん、今${text}って言いました？`
        });
    }
}
//orderChoice関数(「予約する」処理。Flex Message表示)
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

//checkNextReservation関数(未来の予約があるかどうかを確認)
const checkNextReservation = (ev) => {
  return new Promise((resolve,reject)=>{
    const id = ev.source.userId;
    const nowTime = new Date().getTime();
    
    const selectQuery = {
      text: 'SELECT * FROM reservations WHERE line_uid = $1 ORDER BY starttime ASC;',
      values: [`${id}`]
    };
    
    connection.query(selectQuery)
      .then(res=>{
        if(res.rows.length){
          const nextReservation = res.rows.filter(object=>{
            return parseInt(object.starttime) >= nowTime;
          });
          console.log('nextReservation:',nextReservation);
          resolve(nextReservation);
        }else{
          resolve();
        }
      })
      .catch(e=>console.log(e));
  });
 }

//greeting_follow関数(友達登録時の処理)
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
    console.log('postback ev:',ev);
    const profile = await client.getProfile(ev.source.userId);
    const data = ev.postback.data;
    const splitData = data.split('&');

    if(splitData[0] === 'menu'){
        const orderedMenu = splitData[1];
        askDate(ev,orderedMenu);
    }else if(splitData[0] === 'date'){
        const orderedMenu = splitData[1];
        const selectedDate = ev.postback.params.date;
        askTime(ev,orderedMenu,selectedDate);
    }else if(splitData[0] === 'time'){
        const orderedMenu = splitData[1];
        const selectedDate = splitData[2];
        const selectedTime = splitData[3];
        confirmation(ev,orderedMenu,selectedDate,selectedTime);
    }else if(splitData[0] === 'yes'){
      const orderedMenu = splitData[1];
      const selectedDate = splitData[2];
      const selectedTime = splitData[3];
      const startTimestamp = timeConversion(selectedDate,selectedTime);
      const treatTime = await calcTreatTime(ev.source.userId,orderedMenu);
      const endTimestamp = startTimestamp + treatTime*60*1000;
      const insertQuery = {
        text:'INSERT INTO reservations (line_uid, name, scheduledate, starttime, endtime, menu) VALUES($1,$2,$3,$4,$5,$6);',
        values:[ev.source.userId,profile.displayName,selectedDate,startTimestamp,endTimestamp,orderedMenu]
      };
      connection.query(insertQuery)
      .then(res=>{
        console.log('データ格納成功！');
        client.replyMessage(ev.replyToken,{
          "type":"text",
          "text":"予約が完了しました。"
        });
      })
      .catch(e=>console.log(e));
    }else if(splitData[0] === 'no'){
      // あとで何か入れる
    }else if(splitData[0] === 'delete'){
      const id = parseInt(splitData[1]);
      const deleteQuery = {
        text:'DELETE FROM reservations WHERE id = $1;',
        values:[`${id}`]
      };
      connection.query(deleteQuery)
      .then(res=>{
        console.log('予約キャンセル成功');
        client.replyMessage(ev.replyToken,{
          "type":"text",
          "text":"予約をキャンセルしました。"
        });
      })
      .catch(e=>console.log(e));
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
                    "data": `date&${orderedMenu}`,
                    "mode": "date"
                  }
                }
              ]
            }
          }
    });
}

//askTime()
const askTime = (ev,orderedMenu,selectedDate) => {
    return client.replyMessage(ev.replyToken,{
        "type":"flex",
        "altText":"予約日選択",
        "contents":
        {
            "type": "bubble",
            "header": {
              "type": "box",
              "layout": "vertical",
              "contents": [
                {
                  "type": "text",
                  "text": "ご希望の時間帯を選択してください（緑=予約可能です）",
                  "wrap": true,
                  "size": "lg"
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
                        "label": "9時-",
                        "data":`time&${orderedMenu}&${selectedDate}&0`
                      },
                      "style": "primary",
                      "color": "#00AA00",
                      "margin": "md"
                    },
                    {
                      "type": "button",
                      "action": {
                        "type": "postback",
                        "label": "10時-",
                        "data": `time&${orderedMenu}&${selectedDate}&1`
                      },
                      "style": "primary",
                      "color": "#00AA00",
                      "margin": "md"
                    },
                    {
                      "type": "button",
                      "action": {
                        "type": "postback",
                        "label": "11時-",
                        "data": `time&${orderedMenu}&${selectedDate}&2`
                      },
                      "style": "primary",
                      "color": "#00AA00",
                      "margin": "md"
                    }
                  ]
                },
                {
                  "type": "box",
                  "layout": "horizontal",
                  "contents": [
                    {
                      "type": "button",
                      "action": {
                        "type": "postback",
                        "label": "12時-",
                        "data": `time&${orderedMenu}&${selectedDate}&3`
                      },
                      "style": "primary",
                      "color": "#00AA00",
                      "margin": "md"
                    },
                    {
                      "type": "button",
                      "action": {
                        "type": "postback",
                        "label": "13時-",
                        "data": `time&${orderedMenu}&${selectedDate}&4`
                      },
                      "style": "primary",
                      "color": "#00AA00",
                      "margin": "md"
                    },
                    {
                      "type": "button",
                      "action": {
                        "type": "postback",
                        "label": "14時-",
                        "data": `time&${orderedMenu}&${selectedDate}&5`
                      },
                      "style": "primary",
                      "color": "#00AA00",
                      "margin": "md"
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
                        "label": "15時-",
                        "data": `time&${orderedMenu}&${selectedDate}&6`
                      },
                      "style": "primary",
                      "color": "#00AA00",
                      "margin": "md"
                    },
                    {
                      "type": "button",
                      "action": {
                        "type": "postback",
                        "label": "16時-",
                        "data": `time&${orderedMenu}&${selectedDate}&7`
                      },
                      "style": "primary",
                      "color": "#00AA00",
                      "margin": "md"
                    },
                    {
                      "type": "button",
                      "action": {
                        "type": "postback",
                        "label": "17時-",
                        "data": `time&${orderedMenu}&${selectedDate}&8`
                      },
                      "style": "primary",
                      "color": "#00AA00",
                      "margin": "md"
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
                        "label": "18時-",
                        "data": `time&${orderedMenu}&${selectedDate}&9`
                      },
                      "style": "primary",
                      "color": "#00AA00",
                      "margin": "md"
                    },
                    {
                      "type": "button",
                      "action": {
                        "type": "postback",
                        "label": "19時-",
                        "data": `time&${orderedMenu}&${selectedDate}&10`
                      },
                      "style": "primary",
                      "color": "#00AA00",
                      "margin": "md"
                    },
                    {
                      "type": "button",
                      "action": {
                        "type": "postback",
                        "label": "終了",
                        "data": "end"
                      },
                      "style": "primary",
                      "color": "#0000ff",
                      "margin": "md"
                    }
                  ],
                  "margin": "md"
                }
              ]
            }
          }       
    });
 }

//confirmation()予約確認をリプライする
const confirmation = (ev,menu,date,time) => {
    const splitDate = date.split('-');
    const selectedTime = 9 + parseInt(time);

    const today = getToday();
    console.log("現在の日付：" + today);
    console.log("予約日：" + splitDate);
    if(splitDate < today){
      console.log("過去です");
      return client.replyMessage(ev.replyToken,{
        "type":"text",
        "text":`過去の日にちは指定できません\uDBC0\uDC1B`
    });
    }else{
      console.log("現在です");
    }    
    return client.replyMessage(ev.replyToken,{
      "type":"flex",
      "altText":"menuSelect",
      "contents":
      {
        "type": "bubble",
        "body": {
          "type": "box",
          "layout": "vertical",
          "contents": [
            {
              "type": "text",
              "text": `次回予約は${splitDate[1]}月${splitDate[2]}日 ${selectedTime}時〜でよろしいですか？`,
              "size": "lg",
              "wrap": true
            }
          ]
        },
        "footer": {
          "type": "box",
          "layout": "horizontal",
          "contents": [
            {
              "type": "button",
              "action": {
                "type": "postback",
                "label": "はい",
                "data": `yes&${menu}&${date}&${time}`
              }
            },
            {
              "type": "button",
              "action": {
                "type": "postback",
                "label": "いいえ",
                "data": `no&${menu}&${date}&${time}`
              }
            }
          ]
        }
      }
    });
 }
   
//timeConversion関数(日付、時刻をタイムスタンプ形式へ変更)
const timeConversion = (date,time) => {
  const selectedTime = 9 + parseInt(time) - 9;
  return new Date(`${date} ${selectedTime}:00`).getTime();
}
 //dateConversion関数(タイムスタンプを任意の日時、時刻の文字列へ変換)
 const dateConversion = (timestamp) => {
  const d = new Date(parseInt(timestamp));
  const month = d.getMonth()+1;
  const date = d.getDate();
  const day = d.getDay();
  const hour = ('0' + (d.getHours()+9)).slice(-2);
  const min = ('0' + d.getMinutes()).slice(-2);
  return `${month}月${date}日(${WEEK[day]}) ${hour}:${min}`;
 }

//calcTreatTime(データベースから施術時間をとってくる)
const calcTreatTime = (id,menu) => {
  return new Promise((resolve,reject)=>{
    console.log('その2');
    const selectQuery = {
      text: 'SELECT * FROM users WHERE line_uid = $1;',
      values: [`${id}`]
    };
    connection.query(selectQuery)
      .then(res=>{
        console.log('その3');
        if(res.rows.length){
          const info = res.rows[0];
          const treatArray = [info.cuttime,info.shampootime,info.colortime,info.spatime,INITIAL_TREAT[4],INITIAL_TREAT[5],INITIAL_TREAT[6]];
          const menuNumber = parseInt(menu);
          const treatTime = treatArray[menuNumber];
          resolve(treatTime);
        }else{
          console.log('LINE　IDに一致するユーザーが見つかりません。');
          return;
        }
      })
      .catch(e=>console.log(e));
  });
 }




