const express = require('express');//express読み込み
const app = express();
const line = require('@line/bot-sdk');//@line/bot-sdk読み込み
const { Client } = require('pg');//pgライブラリ読み込み
const PORT = process.env.PORT || 5000
const INITIAL_TREAT = [20,10,40,15,30,15,10];  //施術時間初期値
const WEEK = [ "日", "月", "火", "水", "木", "金", "土" ];//曜日の表示を標準化
const MENU = ['カット','シャンプー','カラーリング','ヘッドスパ','マッサージ＆スパ','顔そり','眉整え'];//メニュー名
const HOLIDAY = ["月"];//定休日を設定
const OPENTIME = 9;
const CLOSETIME = 19;
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

//lineBot関数（イベントタイプによって実行関数を振り分け）
const lineBot = (req,res) => {
    res.status(200).end();
    const events = req.body.events;
    const promises = [];
    for(let i=0;i<events.length;i++){
        const ev = events[i];
        switch(ev.type){
            case 'follow'://友達登録で発火
                promises.push(greeting_follow(ev));
                break;
            case 'message'://テキストなどのメッセージ送信で発火
                promises.push(handleMessageEvent(ev));
                break;
            case 'postback'://ボタンが押されたらdataの値を返す
                promises.push(handlePostbackEvent(ev));
                break;
    }   
}
Promise
.all(promises)
.then(console.log('all promises passed'))
.catch(e=>console.error(e.stack));
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

//handleMessageEvent関数(イベントタイプ"message"の処理振り分け)
const handleMessageEvent = async (ev) => {
    console.log('ev:',ev);
    const profile = await client.getProfile(ev.source.userId);
    const text = (ev.message.type === 'text') ? ev.message.text : '';

    if(text === '予約する'){
      const nextReservation = await checkNextReservation(ev);
      /*if(nextReservation.length){
        const startTimestamp = nextReservation[0].starttime;
        const date = dateConversion(startTimestamp);
        const orderedMenu = nextReservation[0].menu;
        //console.log("orderedMenu = " + orderedMenu);
        const menu = orderedMenu.split('%');
        //console.log("menu = " + menu);
        menu.forEach(function(value,index,array){
          array[index] = MENU[value];
        });
        console.log(menu);
        return client.replyMessage(ev.replyToken,{
          "type":"text",
          "text":`次回予約は${date}、${menu}でお取りしてます。変更の場合は予約キャンセル後改めて予約をお願いします。`
        });
      }else{
        orderChoice(ev);
      }*/
    orderChoice(ev);
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

//handlePostbackEvent関数（イベントタイプ"postback"の処理振り分け）
const handlePostbackEvent = async (ev) => {
  console.log('postback ev:',ev);
  const profile = await client.getProfile(ev.source.userId);
  const data = ev.postback.data;
  const splitData = data.split('&');

  if(splitData[0] === 'menu'){
      const orderedMenu = splitData[1];
      otherChoice(ev,orderedMenu);
  }else if(splitData[0] === 'end'){
      const orderedMenu = splitData[1];
      askDate(ev,orderedMenu);
  }else if(splitData[0] === 'date'){
      const orderedMenu = splitData[1];
      const selectedDate = ev.postback.params.date;
      checkReservable(ev,orderedMenu,selectedDate);
      //askTime(ev,orderedMenu,selectedDate);
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
  }else if(splitData[0] === 'cancel'){
    return client.replyMessage(ev.replyToken,{
      "type":"text",
      "text":`終了します。`
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
                "text": "（複数選択可能です）",
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
                      "data": `menu&0`
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
                      "data": `menu&1`
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
                      "data": `menu&2`
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
                      "data": `menu&3`
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
                      "data": `menu&4`
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
                      "data": `menu&5`
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
                      "data": `menu&6`
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
                      "data": `end`
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

//otherChoice関数(「他のメニューを予約する」処理。Flex Message表示)
const otherChoice = (ev,orderedMenu) => {
  const splitData = orderedMenu.split('%');
    console.log(splitData);

  splitData.forEach(function( value, index, array ) {
    array[index] = MENU[value];
  });
  console.log(splitData);

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
                "text": "他にご希望はありますか？",
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
                "text": `選択中：${splitData}`,
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
                      "data": `menu&${orderedMenu}%0`
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
                      "data": `menu&${orderedMenu}%1`
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
                      "data": `menu&${orderedMenu}%2`
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
                      "data": `menu&${orderedMenu}%3`
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
                      "data": `menu&${orderedMenu}%4`
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
                      "data": `menu&${orderedMenu}%5`
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
                      "data": `menu&${orderedMenu}%6`
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
                      "data": `end&${orderedMenu}`
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

//askDate関数（「予約日を聞く」処理）
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

//askTime関数（「時間を聞く」処理）
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

 //checkNextReservation関数(未来の予約があるかどうかを確認)
 const checkNextReservation = (ev) => {
  return new Promise((resolve,reject)=>{
    const id = ev.source.userId;
    const nowTime = new Date().getTime();
    console.log('nowTime:',nowTime);

    const selectQuery = {
      text:'SELECT * FROM reservations;'
    };
    connection.query(selectQuery)
      .then(res=>{
        //console.log('res.rows:',res.rows);
        if(res.rows.length){
          const nextReservation = res.rows.filter(object1=>{
            return object1.line_uid === id;
          })
          .filter(object2=>{
            return parseInt(object2.starttime) >= nowTime;
          });
          console.log('nextReservation:',nextReservation);
          resolve(nextReservation);
        }else{
          resolve([]);
        }
      })
      .catch(e=>console.log(e));
  });
}

//confirmation()予約確認をリプライする
const confirmation = (ev,menu,date,time) => {
    const splitDate = date.split('-');
    const selectedTime = 9 + parseInt(time);
    
    //現在時刻のタイムスタンプを取得
    const present = new Date().getTime();
    //2ヶ月後取得
    const twoMonthsLater = present + 2*30*24*3600*1000;
    //予約日を数値へ変換
    const reservationDayTime = new Date(`${date} ${selectedTime-9}:00`).getTime();
    //予約日の曜日を取得
    const week = new Date(reservationDayTime).getDay();
    console.log("week = " + week);
    const dayName = WEEK[week];
    console.log("dayName = " + dayName);

    if(reservationDayTime < present){
      console.log("過去です");
      return client.replyMessage(ev.replyToken,{
        "type":"text",
        "text":`過去の日にちは指定できません\uDBC0\uDC1B`
    });
    }else if(reservationDayTime >= twoMonthsLater){
      console.log("2ヶ月以上先です");
      return client.replyMessage(ev.replyToken,{
        "type":"text",
        "text":`２ヶ月以上先の日にちは指定できません\uDBC0\uDC1B`
    });
    }else if(dayName == HOLIDAY[0]){
      console.log(HOLIDAY[0] + "は定休日です");
      return client.replyMessage(ev.replyToken,{
        "type":"text",
        "text":`申し訳ございません。${HOLIDAY[0]}曜日 は定休日です。\uDBC0\uDC1B`
    });
    }else{
      console.log("予約OKです");
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

//calcTreatTime(施術時間を計算する)
const calcTreatTime = (id,menu) => {
  return new Promise((resolve,reject)=>{
    const selectQuery = {
      text: 'SELECT * FROM users WHERE line_uid = $1;',
      values: [`${id}`]
    };
    connection.query(selectQuery)
      .then(res=>{
        if(res.rows.length){
          const info = res.rows[0];
          const menuArray = menu.split('%');
          const treatArray = [info.cuttime,info.shampootime,info.colortime,info.spatime,INITIAL_TREAT[4],INITIAL_TREAT[5],INITIAL_TREAT[6]];
          let treatTime = 0;
          menuArray.forEach(value=>{
            treatTime += treatArray[parseInt(value)];
          });
          console.log('info = ',info);//予約者のid からspatimeまでの情報が連想配列の形で出力info =  {id: 1,.......spatime: 15}
          console.log('menuArray = '+menuArray);//menuArray = 0,3の形で出力される
          console.log('treatArray = ',treatArray);//users登録しているメニュー時間を配列の形で出力treatArray =  [20, 10,.......]
          console.log('treatTime = '+treatTime);//treatTime = 35の形で出力（選択メニューの合計施術時間）
          resolve(treatTime);
        }else{
          console.log('LINE　IDに一致するユーザーが見つかりません。');
          return;
        }
      })
      .catch(e=>console.log(e));
  });
 }

 //checkReservable関数（予約可能な時間をチェックする）
 const checkReservable = (ev,menu,date) => {
  return new Promise( async (resolve,reject)=>{
    const id = ev.source.userId;
    const treatTime = await calcTreatTime(id,menu);
    console.log('treatTime:',treatTime);
    const treatTimeToMs = treatTime*60*1000;

    const select_query = {
      text:'SELECT * FROM reservations WHERE scheduledate = $1 ORDER BY starttime ASC;',
      values:[`${date}`]
    };

    connection.query(select_query)
      .then(res=>{
        console.log('res.rows:',res.rows);
        const reservedArray = res.rows.map(object=>{
          return [parseInt(object.starttime),parseInt(object.endtime)];
        });
        console.log('reservedArray:',reservedArray);//すでに入っている予約の開始時間と終了時間、タイムスタンプで配列の形で出力

        //各時間のタイムスタンプ
        // herokuサーバー基準なので、日本の時刻は９時間分進んでしまうため、引く
        const timeStamps = [];
        for(let i=OPENTIME; i<CLOSETIME; i++){
          timeStamps.push(new Date(`${date} ${i}:00`).getTime()-9*60*60*1000);
        }
        console.log('timestamps',timeStamps);

        //この日の予約を各時間帯に関する予約へ分割し、それを3次元配列に格納していく。
        const separatedByTime = [];
        for(let i=0; i<CLOSETIME-OPENTIME; i++){
          const tempArray = [];
          reservedArray.forEach(array=>{
            //パターン0
            if(array[0]<timeStamps[i] && (array[1]>timeStamps[i] && array[1]<timeStamps[i+1])){
              tempArray.push(array.concat([0]));
            }
            //パターン１
            else if((array[0]>=timeStamps[i] && array[0]<timeStamps[i+1]) && array[1]>=timeStamps[i+1]){
              tempArray.push(array.concat([1]));
            }
            //パターン２
            else if((array[0]>=timeStamps[i] && array[0]<timeStamps[i+1])&&(array[1]>array[0] && array[1]<timeStamps[i+1])){
              tempArray.push(array.concat([2]));
            }
            //パターン３
            else if(array[0]<timeStamps[i] && array[1]>timeStamps[i+1]){
              tempArray.push(array.concat([3]));
            }
          });
          separatedByTime.push(tempArray);
        }

        //ある時間帯の最後の要素がパターン0とパターン2の場合、次の時間帯の最初の要素を加える
        for(let i=0; i<separatedByTime.length; i++){
          if(separatedByTime[i].length){
            if(separatedByTime[i+1].length){
              const l = separatedByTime[i].length - 1;
              const pattern = separatedByTime[i][l][2];
              if(pattern === 0 || pattern === 2){
                separatedByTime[i].push(separatedByTime[i+1][0]);
              }
            }else{
              //次の時間帯に予約が入っていなければとりあえず、timeStamps[i]から1時間+treatTime分のタイムスタンプを格納
              separatedByTime[i].push([timeStamps[i]+60*60*1000+treatTimeToMs]);
            }
          }
        }

        console.log('separatedByTime:',separatedByTime);

        //予約と予約の間隔を格納する3次元配列を生成する
        const intervalArray = [];
        for(let i=0; i<separatedByTime.length; i++){
          if(separatedByTime[i].length){
            const pattern = separatedByTime[i][0][2];

            if(pattern === 0 || pattern === 2){
              const tempArray = [];
              for(let j=0; j<separatedByTime[i].length-1; j++){
                tempArray.push([separatedByTime[i][j+1][0]-separatedByTime[i][j][1], separatedByTime[i][j][1]]);
              }
              intervalArray.push(tempArray);
            }else if(pattern === 1){
              intervalArray.push([separatedByTime[i][0][0]-timeStamps[i],timeStamps[i]]);
            }else if(pattern === 3){
              intervalArray.push([]);
            }
          }else{
            intervalArray.push([[60*60*1000,timeStamps[i]]]);
          }
        }
        console.log('intervalArray:',intervalArray);
        console.log('treatTime:',treatTime);

        //reservableArrayを生成
        const reservableArray = [];
        intervalArray.forEach(array2=>{
          const tempArray = [];
          array2.forEach(array=>{
            let interval = array[0];
            let target = array[1];
            while(interval>treatTimeToMs){
              tempArray.push(target);
              interval -= treatTimeToMs;
              target += treatTimeToMs;
            }            
          });
          reservableArray.push(tempArray);
        });

        console.log('reservableArray:',reservableArray);
      })
      .catch(e=>console.log(e));
  });
}
