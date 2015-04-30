var uuid = require('node-uuid');
var crypto = require('crypto');

var mongoose = require('mongoose');
var Login = mongoose.model('Login');

var mail = require('../../components/mail');
var mailText = require('../../components/mail_text');



var session = [];




function password_check(hash,clr,callback){
	var split=hash.split('$');
	_password_hash(split[2],clr,function(result){
		callback(result==hash);
 });
};

function _password_hash(salt,clr,callback){
	crypto.pbkdf2(clr,salt,10000,20,function(err,hashPass){
		if(err)
			return callback(false);
		callback('pbkdf2_sha1$10000$'+ salt+"$"+(new Buffer(hashPass,'utf8')).toString('base64'));
	});
};

function password_create(password,callback){
	_password_hash(crypto.randomBytes(8).toString('base64'),password,function(result){
		callback(result);
	});
};


module.exports = function(socket) {
	var id;

	function init(val){
		if(typeof session[val] === 'undefined'){
			id=uuid.v4();
			session[id]={data:{login:false,sessionid:id},id:id};
		}else
			id=val;
		console.log(id);
	}


	socket.on('api::session::start',function(val,callback){
		init(val);
		callback(_request({s:true}));
	});

	socket.on('api::session::login',function(val,callback){
		init(id);
		Login.findOne({mail: val.mail}, function(err,login) {
			if(!err && login){
				if(login.active){
					password_check(login.password,val.password,function(result){
						if(result){
							login.lastloginAt = new Date();
							login.save();
							session[id].data.login = true;
							session[id].data.name = login.name;
							callback(_request({s:true}));
						}else{
							callback(_request({s:false,form:{field:{'password':true}}}));
						}
					});
				}else{
					callback(_request({s:false,form:{field:{'active':true}}}));
				}
			}else
				callback(_request({s:false,form:{field:{'mail':true}}}));
		});
	});

	socket.on('api::session::logout',function(callback){
		init(id);
		session[id].data.login = false;
		callback(_request({s:true}));
		delete session[id];
	});

	socket.on('api::session::signup',function(val,callback){
		init(id);
		if(!session[id].data.login){
			Login.findOne({mail: val.mail},function(err,exists) {
				if(err || exists.length != 0){
					callback(_request({s:false,form:{field:{'mail':true}}}));
				}else{
					password_create(val.password,function(hashPassword){
						var code = crypto.randomBytes(6).toString('hex');
						var login = new Login();
						login.name = val.name;
						login.mail = val.mail;
						login.password = hashPassword;
						login.code = 's:'+code;
						login.active = false;

						login.save(function(err,loginSaved){
							if(err){
								callback(_request({s:false,form:{field:{'mail':true}}}));
								return;
							}

							mail.sendMail(mailText({to:val.mail},'signup_active',{code:code,mail:val.mail}),function(error){
								if(error){
									loginSaved.delete();
									callback(_request({s:false,form:{field:{'mail':true}}}));
								}else{
									callback(_request({s:true}));
								}
							});
						});
					});
				}
			});
		}else{
			callback(_request({s:false}));
		}
	});

	socket.on('api::session::signup::active',function(val,callback){
		init(id);
		Login.findOne({mail: val.mail}, function(err,login) {
			if(!err && login){
				if(login.code == 's:'+val.code){
					login.active = true;
					login.code = '';
					login.save();
					callback(_request({s:true,data:{name:login.name}}));
				}else{
					callback(_request({s:false,form:{field:{'code':true}}}));
				}
			}else
				callback(_request({s:false,form:{field:{'mail':true}}}));
		});
	});

	function _request(data,callback){
		data.session=session[id].data;
		if(typeof callback === 'function')
			callback(data);
		return data;
	}
	return {request:_request};
};