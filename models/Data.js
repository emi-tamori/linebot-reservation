const { Client } = require('pg'); 

const connection = new Client({ 
    user:process.env.PG_USER, 
    host:process.env.PG_HOST, 
    database:process.env.PG_DATABASE, 
    password:process.env.PG_PASSWORD, 
    port:5432 
}); 
connection.connect(); 

module.exports = { 
    findData: () => { 
        return new Promise((resolve,reject)=>{ 
            const pickup_users = { text:'SELECT * FROM users;' }; 
            const pickup_reservations = { text:'SELECT * FROM reservations;' }; 
            connection.query(pickup_users) 
            .then(users=>{ 
                connection.query(pickup_reservations) 
                .then(reservations=>{ 
                    const data = { users:users.rows, reservations:reservations.rows } 
                    console.log('data in model:',data); 
                    resolve(data); 
                }) 
                .catch(e=>console.log(e)) 
            }) 
            .catch(e=>console.log(e)) 
        }); 
    },
    updateUser: ({id,name,cuttime,shampootime,colortime,spatime}) => { 
        return new Promise((resolve,reject)=>{ 
            const update_query = { 
                text:`UPDATE users SET (display_name,cuttime,shampootime,colortime,spatime) = ('${name}',${cuttime},${shampootime},${colortime},${spatime}) WHERE id=${id};`
            }
            connection.query(update_query) 
            .then(res=>{ 
                console.log('お客さま情報更新成功'); 
                resolve('お客さま情報更新成功'); 
            }) 
            .catch(e=>console.log(e.stack)); 
        }); 
    }
}