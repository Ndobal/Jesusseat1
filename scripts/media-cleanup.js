import {loadConfig} from '../src/config.js';
import {openDatabase} from '../src/db.js';
import {purgeMedia} from '../src/media.js';
const config=loadConfig(),db=openDatabase(config.databasePath);
try{console.log('Expired media staging records removed:',purgeMedia(db));}finally{db.close();}
