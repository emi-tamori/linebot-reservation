(()=>{ 
    const API_URL = 'https://emibot-reservation.herokuapp.com/api/';//herokuの基本アドレスの後ろに/apiをつけたも(APIサーバのアドレス)
     window.addEventListener('load',()=>{ fetchData(); }); 
     //フロント側からfetchにより /apiへGETリクエストを送信
     const fetchData = async () => { try{ 
        const response = await fetch(API_URL); 
        console.log('response:',response); 
        const data = await response.json(); 
        console.log('data:',data); 
    }
        catch(error){ alert('データ読み込み失敗です'); } } 
 })();