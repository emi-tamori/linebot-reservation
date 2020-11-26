const express = require('express');//express読み込み
const app = express();
const line = require('@line/bot-sdk');//@line/bot-sdk読み込み
const { Client } = require('pg');//pgライブラリ読み込み

const PORT = process.env.PORT || 5000

const INITIAL_TREAT = [20,10,40,15,30,15,10];  //施術時間初期値
const WEEK = [ "日", "月", "火", "水", "木", "金", "土" ];//曜日の表示を標準化
const MENU = ['カット','シャンプー','カラーリング','ヘッドスパ','マッサージ＆スパ','顔そり','眉整え'];//メニュー名
const HOLIDAY = ["月"];//定休日を設定
const REGULAR_COLOSE = [1]; //定休日の曜日
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
      orderChoice(ev,'');
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
        const orderedMenu = nextReservation[0].menu;
        const menu = orderedMenu.split('%');
        menu.forEach(function(value,index,array){
          array[index] = MENU[value];
        });
        console.log("menu = " + menu);
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
    }
    else{
      return client.replyMessage(ev.replyToken,{
        "type":"text",
        "text":`${text}`
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
    const ordered = splitData[1];
    const newOrdered = splitData[2];
    const orderedMenu = ordered ? ordered + '%' + newOrdered : newOrdered;
    orderChoice(ev,orderedMenu);
  }else if(splitData[0] === 'end'){
    // メニューが何も選ばれていない時の処理
    const orderedMenu = splitData[1];
    if(!orderedMenu){
      return client.replyMessage(ev.replyToken,{
        "type":"text",
        "text":"何かメニューを選んでください。"
      });
    }
    askDate(ev,orderedMenu);
  }else if(splitData[0] === 'date'){
    const orderedMenu = splitData[1];
      const selectedDate = ev.postback.params.date;

      //「過去の日にち」、「定休日」、「２ヶ月先」の予約はできないようフィルタリングする
      const today_y = new Date().getFullYear();
      const today_m = new Date().getMonth() + 1;
      const today_d = new Date().getDate();
      const today = new Date(`${today_y}/${today_m}/${today_d} 0:00`).getTime() - 9*60*60*1000;
      const targetDate = new Date(`${selectedDate} 0:00`).getTime() - 9*60*60*1000;

      //選択日が過去でないことの判定
      if(targetDate>=today){
        const targetDay = new Date(`${selectedDate}`).getDay();
        const dayCheck = REGULAR_COLOSE.some(day => day === targetDay);
        //定休日でないことの判定
        if(!dayCheck){
          const futureLimit = today + FUTURE_LIMIT*24*60*60*1000;
          //２ヶ月先でないことの判定
          if(targetDate <= futureLimit){
            const reservableArray = await checkReservable(ev,orderedMenu,selectedDate);
            askTime(ev,orderedMenu,selectedDate,reservableArray);
          }else{
            return client.replyMessage(ev.replyToken,{
              "type":"text",
              "text":`${FUTURE_LIMIT}日より先の予約はできません><;`
            });
          }
        }else{
          return client.replyMessage(ev.replyToken,{
            "type":"text",
            "text":"定休日には予約できません><;"
          });
        }
      }else{
        return client.replyMessage(ev.replyToken,{
          "type":"text",
          "text":"過去の日にちには予約できません><;"
        });
      }
  }else if(splitData[0] === 'time'){
    const orderedMenu = splitData[1];
    const selectedDate = splitData[2];
    const selectedTime = splitData[3];

    //予約不可の時間帯は-1が返ってくるためそれを条件分岐
    if(selectedTime >= 0){
      confirmation(ev,orderedMenu,selectedDate,selectedTime,0);
    }else{
      return client.replyMessage(ev.replyToken,{
        "type":"text",
        "text":"申し訳ありません。この時間帯には予約可能な時間がありません><;"
      });
    }
  }else if(splitData[0] === 'yes'){
    const orderedMenu = splitData[1];
        const selectedDate = splitData[2];
        const fixedTime = parseInt(splitData[3]);
       
        //施術時間の取得
        const treatTime = await calcTreatTime(ev.source.userId,orderedMenu);

        //予約完了時間の計算
        const endTime = fixedTime + treatTime*60*1000;

        //予約確定前の最終チェック→予約ブッキング無しfalse、予約ブッキングありtrue
        const check = await finalCheck(selectedDate,fixedTime,endTime);

        if(!check){
          const insertQuery = {
            text:'INSERT INTO reservations (line_uid, name, scheduledate, starttime, endtime, menu) VALUES($1,$2,$3,$4,$5,$6);',
            values:[ev.source.userId,profile.displayName,selectedDate,fixedTime,endTime,orderedMenu]
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
        }else{
          return client.replyMessage(ev.replyToken,{
            "type":"text",
            "text":"先に予約を取られてしまいました><; 申し訳ありませんが、再度別の時間で予約を取ってください。"
          });
        }
  }else if(splitData[0] === 'no'){
    const orderedMenu = splitData[1];
      const selectedDate = splitData[2];
      const selectedTime = splitData[3];
      const num = parseInt(splitData[4]);
      if(num === -1){
        return client.replyMessage(ev.replyToken,{
          "type":"text",
          "text":"申し訳ありません。この時間帯には予約可能な時間がありません><;"
        });
      }else{
        confirmation(ev,orderedMenu,selectedDate,selectedTime,num);
      }
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
          resolve(treatTime);
        }else{
          console.log('LINE　IDに一致するユーザーが見つかりません。');
          return;
        }
      })
      .catch(e=>console.log(e));
  });
 }

//orderChoice関数(「予約する」処理。Flex Message表示)
const orderChoice = (ev,selected) => {
  console.log('selected:',selected);

  let selectedNew = '';

  if(selected.match(/%/)){
    const ordersArray = selected.split('%');
    console.log('ordersArray1:',ordersArray);
    // 重複チェック
    const duplicationRemovedArray = new Set(ordersArray);
    if(duplicationRemovedArray.size === ordersArray.length){
      selectedNew = selected;
    }else{
      //重複メニュー弾き
      ordersArray.pop();
      //selectedNew生成
      ordersArray.forEach((value,index)=>{
        selectedNew += index === 0 ? value : '%' + value;
      });
    }
  }else{
    selectedNew = selected;
  }
  console.log('selectedNew１:',selectedNew);
  const ordersArrayNew = selectedNew.split('%');

  const numericArray = [];
  if(selectedNew){
    //数値型化
    ordersArrayNew.forEach(value=>{
      numericArray.push(parseInt(value));
    });
    //昇順ソート
    numericArray.sort((a,b)=>{
      return (a<b ? -1:1);
    });
    //selectedNew更新
    selectedNew = '';
    numericArray.forEach((value,index)=>{
      selectedNew += index === 0 ? value : '%' + value;
    });
  }

  console.log('selectedNew2:',selectedNew);

  // タイトルと選択メニュー表示
  let title = '';
  let menu = '';
  if(selectedNew){
    title = '他にご希望はありますか？'
    numericArray.forEach((value,index)=>{
      menu += index !== 0 ? ',' + MENU[parseInt(value)] : '選択中：' + MENU[parseInt(value)];
    });
  }else{
    title = 'メニューを選択してください';
    menu = '(複数選択可能です)';
  }

  //ボタン配色
  const colors = [];
  for(let i=0;i<7;i++){
    if(numericArray.some(num=> num === i)){
      colors.push('#00AA00');
    }else{
      colors.push('#999999');
    }
  }

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
                "text": `${title}`,
                "align": "center",
                "size": "lg",
                "wrap":true
              }
            ]
          },
          "hero": {
            "type": "box",
            "layout": "vertical",
            "contents": [
              {
                "type": "text",
                "text": `${menu}`,
                "size": "md",
                "align": "center",
                "wrap":true
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
                      "data": `menu&${selectedNew}&0`
                    },
                    "style": "primary",
                    "color": `${colors[0]}`,
                    "margin": "md"
                  },
                  {
                    "type": "button",
                    "action": {
                      "type": "postback",
                      "label": "シャンプー",
                      "data": `menu&${selectedNew}&1`
                    },
                    "style": "primary",
                    "color": `${colors[1]}`,
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
                      "label": "ｶﾗｰﾘﾝｸﾞ",
                      "data": `menu&${selectedNew}&2`
                    },
                    "margin": "md",
                    "style": "primary",
                    "color": `${colors[2]}`
                  },
                  {
                    "type": "button",
                    "action": {
                      "type": "postback",
                      "label": "ヘッドスパ",
                      "data": `menu&${selectedNew}&3`
                    },
                    "margin": "md",
                    "style": "primary",
                    "color": `${colors[3]}`
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
                      "label": "ﾏｯｻｰｼﾞ&ﾊﾟｯｸ",
                      "data": `menu&${selectedNew}&4`
                    },
                    "margin": "md",
                    "style": "primary",
                    "color": `${colors[4]}`
                  },
                  {
                    "type": "button",
                    "action": {
                      "type": "postback",
                      "label": "顔そり",
                      "data": `menu&${selectedNew}&5`
                    },
                    "style": "primary",
                    "color": `${colors[5]}`,
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
                      "label": "眉整え",
                      "data": `menu&${selectedNew}&6`
                    },
                    "margin": "md",
                    "style": "primary",
                    "color": `${colors[6]}`
                  },
                  {
                    "type": "button",
                    "action": {
                      "type": "postback",
                      "label": "選択終了",
                      "data": `end&${selectedNew}`
                    },
                    "margin": "md",
                    "style": "primary",
                    "color": "#0000ff"
                  }
                ],
                "margin": "md"
              },
              {
                "type": "separator"
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
                "text": `来店希望日を選んでください。\n${HOLIDAY}曜日は定休日です`,
                "size": "md",
                "wrap": true,
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
const askTime = (ev,orderedMenu,selectedDate,reservableArray) => {
  const time = [];
  const color = [];
  //予約時間帯とボタン色配列を生成
  for(let i=0;i<reservableArray.length;i++){
    if(reservableArray[i].length){
      time.push(i);
      color.push('#00AA00');
    }else{
      time.push(-1);
      color.push('#FF0000');
    }
  }

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
              "text": `${selectedDate}`,
              "weight": "bold",
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
              "text": "ご希望の時間帯を選択してください(緑＝予約可能)",
              "align": "center",
              "wrap":true,
              "size":"lg"
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
                      "data":`time&${orderedMenu}&${selectedDate}&${time[0]}`
                    },
                    "style": "primary",
                    "color": `${color[0]}`,
                    "margin": "md"
                  },
                  {
                    "type": "button",
                    "action": {
                      "type": "postback",
                      "label": "10時-",
                      "data": `time&${orderedMenu}&${selectedDate}&${time[1]}`
                    },
                    "style": "primary",
                    "color": `${color[1]}`,
                    "margin": "md"
                  },
                  {
                    "type": "button",
                    "action": {
                      "type": "postback",
                      "label": "11時-",
                      "data": `time&${orderedMenu}&${selectedDate}&${time[2]}`
                    },
                    "style": "primary",
                    "color": `${color[2]}`,
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
                      "data": `time&${orderedMenu}&${selectedDate}&${time[3]}`
                    },
                    "style": "primary",
                    "color": `${color[3]}`,
                    "margin": "md"
                  },
                  {
                    "type": "button",
                    "action": {
                      "type": "postback",
                      "label": "13時-",
                      "data": `time&${orderedMenu}&${selectedDate}&${time[4]}`
                    },
                    "style": "primary",
                    "color": `${color[4]}`,
                    "margin": "md"
                  },
                  {
                    "type": "button",
                    "action": {
                      "type": "postback",
                      "label": "14時-",
                      "data": `time&${orderedMenu}&${selectedDate}&${time[5]}`
                    },
                    "style": "primary",
                    "color": `${color[5]}`,
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
                      "data": `time&${orderedMenu}&${selectedDate}&${time[6]}`
                    },
                    "style": "primary",
                    "color": `${color[6]}`,
                    "margin": "md"
                  },
                  {
                    "type": "button",
                    "action": {
                      "type": "postback",
                      "label": "16時-",
                      "data": `time&${orderedMenu}&${selectedDate}&${time[7]}`
                    },
                    "style": "primary",
                    "color": `${color[7]}`,
                    "margin": "md"
                  },
                  {
                    "type": "button",
                    "action": {
                      "type": "postback",
                      "label": "17時-",
                      "data": `time&${orderedMenu}&${selectedDate}&${time[8]}`
                    },
                    "style": "primary",
                    "color": `${color[8]}`,
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
                      "data": `time&${orderedMenu}&${selectedDate}&${time[9]}`
                    },
                    "style": "primary",
                    "color": `${color[9]}`,
                    "margin": "md"
                  },
                  {
                    "type": "button",
                    "action": {
                      "type": "postback",
                      "label": " ",
                      "data": "null"
                    },
                    "style": "primary",
                    "color": "#999999",
                    "margin": "md"
                  },
                  {
                    "type": "button",
                    "action": {
                      "type": "postback",
                      "label": " ",
                      "data": "null"
                    },
                    "style": "primary",
                    "color": "#999999",
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

//confirmation関数（予約確認をリプライする）
const confirmation = async (ev,menu,date,time,n) => {
  const splitDate = date.split('-');
  const selectedTime = 9 + parseInt(time);
  const reservableArray = await checkReservable(ev,menu,date);
  const candidates = reservableArray[parseInt(time)];
  const n_dash = (n>=candidates.length-1) ? -1 : n+1;
  console.log('n_dash:',n_dash);

  const proposalTime = dateConversion(candidates[n]);

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
            "text":  `次回予約は${proposalTime}でよろしいですか？`,
            // "text": `次回予約は${splitDate[1]}月${splitDate[2]}日 ${selectedTime}時〜でよろしいですか？`,
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
              "data": `yes&${menu}&${date}&${candidates[n]}`
            }
          },
          {
            "type": "button",
            "action": {
              "type": "postback",
              "label": "いいえ",
              "data": `no&${menu}&${date}&${time}&${n_dash}`
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
    console.log('nowTime:',nowTime);

    const selectQuery = {
      text:'SELECT * FROM reservations;'
    };
    connection.query(selectQuery)
      .then(res=>{
        console.log('res.rows:',res.rows);
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
        console.log('reservedArray:',reservedArray);

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
            if(array[0]<=timeStamps[i] && (array[1]>timeStamps[i] && array[1]<timeStamps[i+1])){
              tempArray.push(array.concat([0]));
            }
            //パターン１
            else if((array[0]>timeStamps[i] && array[0]<timeStamps[i+1]) && array[1]>=timeStamps[i+1]){
              tempArray.push(array.concat([1]));
            }
            //パターン２
            else if((array[0]>timeStamps[i] && array[0]<timeStamps[i+1])&&(array[1]>array[0] && array[1]<timeStamps[i+1])){
              tempArray.push(array.concat([2]));
            }
            //パターン３
            else if(array[0]<=timeStamps[i] && array[1]>=timeStamps[i+1]){
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
            }
            else{
              //次の時間帯に予約が入っていなければとりあえず、timeStamps[i]から1時間+treatTime分のタイムスタンプを格納
              separatedByTime[i].push([timeStamps[i]+60*60*1000+treatTimeToMs]);
            }
          }
        }

        console.log('separatedByTime:',separatedByTime);

        //予約と予約の間隔を格納する3次元配列を生成する
        const intervalArray = [];
        for(let i=0; i<separatedByTime.length; i++){
          //時間帯に予約が入っている場合
          if(separatedByTime[i].length){
            //separatedByTime[i]の先頭のパターンを取得
            const pattern = separatedByTime[i][0][2];
            //パターン0,2の場合
            if(pattern === 0 || pattern === 2){
              const tempArray = [];
              for(let j=0; j<separatedByTime[i].length-1; j++){
                tempArray.push([separatedByTime[i][j+1][0]-separatedByTime[i][j][1], separatedByTime[i][j][1]]);
              }
              console.log('temparray in 0 or 2:',tempArray);
              intervalArray.push(tempArray);
            }else if(pattern === 1){
              intervalArray.push([[separatedByTime[i][0][0]-timeStamps[i],timeStamps[i]]]);
            }else if(pattern === 3){
              intervalArray.push([]);
            }
          }else if(i<separatedByTime.length-1 && separatedByTime[i+1].length){
            intervalArray.push([[separatedByTime[i+1][0][0] - timeStamps[i],timeStamps[i]]]);
          }else{
            intervalArray.push([[60*60*1000+treatTime*60*1000,timeStamps[i]]]);
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

        resolve(reservableArray);
      })
      .catch(e=>console.log(e));
  });
}

//finalCheck関数
const finalCheck = (date,startTime,endTime) => {
  return new Promise((resolve,reject) => {
    const select_query = {
      text:`SELECT * FROM reservations WHERE scheduledate = '${date}';`
    }
    connection.query(select_query)
      .then(res=>{
        if(res.rows.length){
          const check = res.rows.some(object=>{
            return ((startTime>object.starttime && startTime<object.endtime)
            || (startTime<=object.starttime && endTime>=object.endtime)
            || (endTime>object.starttime && endTime<object.endtime));
          });
          resolve(check);
        }else{
          resolve(false);
        }
      })
      .catch(e=>console.log(e));
  });
}




//otherChoice関数(「他のメニューを予約する」処理。Flex Message表示)
/*const otherChoice = (ev,orderedMenu) => {
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
}*/
 
//timeConversion関数(日付、時刻をタイムスタンプ形式へ変更)
/*const timeConversion = (date,time) => {
  const selectedTime = 9 + parseInt(time) - 9;
  return new Date(`${date} ${selectedTime}:00`).getTime();
}*/





