//Source Help From:https://github.com/mame82/misc/blob/master/native_binder.ts#L119

class CPPParcelMapper {
	constructor(binderClassName) {
		this.className = binderClassName;
		this.libBinder = Module.load("libbinder.so");
		this.funPattern = this.createRegex(binderClassName);
		this.exports = this.libBinder.enumerateExports();
		this.filteredExports = this.exports.filter(expDetails => expDetails.name.match(this.funPattern));
		this.hasInit = false;
		this.exportMap = new Map();
		this.initClass();
	}
	
	createRegex(binderClassName) { return new RegExp(`.*${binderClassName}.*transact.*`); }
	
	initClass() {
		if(this.hasInit === false) {
			const reParcel = /.*android[0-9]{1,3}Parcel.*/;
			this.libParcelExports = this.exports.filter(exp => exp.name.match(reParcel));
			const requiredExports = [
			  "data",			 //_ZNK7android6Parcel4dataEv
			  "setDataPosition", //_ZNK7android6Parcel15setDataPositionEm	(dosnt pick this up)
			  //"dataAvail",
			  //"dataPosition",
			  //"ipcData",
			  //"ipcDataSize",
			  "dataPosition", 	 //_ZNK7android6Parcel12dataPositionEv
			  "readInt32", 		 //_ZNK7android6Parcel9readInt32Ev
			  "readInt64", 		 //_ZNK7android6Parcel9readInt64Ev
			  "readUint32",		 //_ZNK7android6Parcel10readUint32Ev
			  "readUint64",		 //_ZNK7android6Parcel10readUint64Ev
			  "readString16Inplace",	 
			  "readString8Inplace",	 	
			  "dataSize"		 //_ZNK7android6Parcel8dataSizeEv
			];
			
			for (let expName of requiredExports) {
			  const exp = this.getExportByMethodName(expName);
			  console.log(exp.name + "\n");
			  if (exp) 
				  this.exportMap.set(expName, exp);
			  else
				console.log( `Can not find export for Parcel member function '${expName}'`);
			}
				
			this.hasInit = true;
		}
	}
	
	getExportByMethodName(name) {
		if (!this.libParcelExports) 
			return null;
		
		const patZer = new RegExp(`.*android[0-9]{1,3}Parcel[0-9]{1,3}${name}E[RPabvfdjim]`);				//If that fails then Check for a (M) at the end
		const patOne = new RegExp(`.*android[0-9]{1,3}Parcel[0-9]{1,3}${name}E[RPabvfdji]`);				//If the (2) char check (E) Followed with (RPabvfdji) Fails then use this Pattern
		const patTwo = new RegExp(`.*android[0-9]{1,3}Parcel[0-9]{1,3}${name}E[RPabvfdji](?![a-zA-Z0-9])`); //Some end in 3 chars so we ignore the (3) char ones
		
		let matches = this.libParcelExports.filter(e => e.name.match(patTwo));
		if(matches.length <= 0) 
			matches = this.libParcelExports.filter(e => e.name.match(patOne));
		if(matches.length <= 0) 
			matches = this.libParcelExports.filter(e => e.name.match(patZer));
		
		if(matches.length >= 1) {
			for(let m of matches) 
				if(m.type === "function") 
					return m;
		}
		
		return null;
	}
	
	get(exportName) {
		return this.exportMap.get(exportName);
	}
}

class CPPParcelEx {
	constructor(addr, map) {
		this.thisAddr = addr;
		this.exportMap = map;
		this.position = 0;
	}
	
	readInt64() {
		const exp = this.exportMap.get("readInt64")
		if (!exp) return 0
		const dynFunc = new NativeFunction(exp.address, "int64", ["pointer"]);
		return dynFunc(this.thisAddr);
	}
	
	readUint64() {
		const exp = this.exportMap.get("readUint64")
		if (!exp) return 0
		const dynFunc = new NativeFunction(exp.address, "uint64", ["pointer"]);
		return dynFunc(this.thisAddr);
	}
	
	readInt32() {
		const exp = this.exportMap.get("readInt32")
		if (!exp) return 0
		const dynFunc = new NativeFunction(exp.address, "int", ["pointer"]);
		return dynFunc(this.thisAddr);
	}
	
	readUint32() {
		const exp = this.exportMap.get("readUint32")
		if (!exp) return 0
		const dynFunc = new NativeFunction(exp.address, "uint", ["pointer"]);
		return dynFunc(this.thisAddr);
	}
	
	restorePosition() {
		this.setDataPosition(this.position);
	}
	
	savePosition() {
		this.position = this.dataPosition();
	}
	
	readString8() {
		let allc = Memory.alloc(Process.pointerSize);
		const exp = this.exportMap.get("readString8Inplace");
		const dynFunc = new NativeFunction(exp.address, "pointer", ["pointer", "pointer"]);
		let ret = dynFunc(this.thisAddr, allc);
		let sz = allc.readU32();
		if(sz === 0)
			return "";

		return Memory.readUtf16String(ret, sz);
	}

	readString16() {
		let allc = Memory.alloc(Process.pointerSize);
		const exp = this.exportMap.get("readString16Inplace");
		const dynFunc = new NativeFunction(exp.address, "pointer", ["pointer", "pointer"]);
		let ret = dynFunc(this.thisAddr, allc);
		let sz = allc.readU32();
		if(sz === 0)
			return "";

		return Memory.readUtf16String(ret, sz);
	}

	setDataPosition(position) {
		const exp = this.exportMap.get("setDataPosition")
		if (!exp) return 0
		const dynFunc = new NativeFunction(exp.address, "void", ["pointer", "uint"]);
		const result = dynFunc(this.thisAddr, position);
	}
	
	dataPosition() {
		const exp = this.exportMap.get("dataPosition")
		if (!exp) return 0
		const dynFunc = new NativeFunction(exp.address, "uint", ["pointer"]);
		return dynFunc(this.thisAddr);
	}
   
	dump() {
		const pData = this.data();
		const dataSize = this.dataSize();
		if (dataSize && pData) return hexdump(pData, { length: dataSize });
		return "";
	}

	dataSize() {
		const dataSizeFuncExport = this.exportMap.get("dataSize");
		if (!dataSizeFuncExport) return 0;
		const funcDataSize = new NativeFunction(dataSizeFuncExport.address, "int", ["pointer"]);
		const result = funcDataSize(this.thisAddr);
		return result;
	}

	data() {
		const dataFuncExport = this.exportMap.get("data");
		if (!dataFuncExport) return null;
		const funcData = new NativeFunction(dataFuncExport.address, "pointer", ["pointer"]);
		const result = funcData(this.thisAddr);
		return result;
	}
  
	javaInstance() {
		if (!Java.available) return null;
		const clazzParcel = Java.use("android.os.Parcel");
		const nativePtr = this.thisAddr.toUInt32();
		const parcelFromPool = clazzParcel.obtain(nativePtr);
		return parcelFromPool;
	}
}


let FLAG_ONEWAY = 0x00000001;
let FIRST_CALL_TRANSACTION = 0x00000001;
let LAST_CALL_TRANSACTION = 0x00ffffff;
		

function hookBpBinder() {
	try {
		let bpBinder = new CPPParcelMapper("BpBinder");
		let bBinder = new CPPParcelMapper("BBinder");
		
		//let allTransactExports = bpBinder.filteredExports.concat(bBinder.filteredExports);
		
		hookBinderTransact(bpBinder);
		hookBinderTransact(bBinder);
	} catch(e) {
		console.log("[E] [Outter Error]:" + e);
	}
}

function hookBinderTransact(mapper) {
	try {
		for(let exp of mapper.filteredExports) {
			console.log("[E] " + exp.name + " Address:" + exp.address + "\n");
			Interceptor.attach(exp.address, { 
				onEnter: function(args) {
					try {
						this.binderInstance = args[0];
						this.code = (args[1]).toUInt32(); // uint32_t
						this.pData = args[2];
						this.pReply = args[3];
						this.flags = (args[4]).toUInt32(); // uint32_t
						//We prepare before as we want to attack after No matter what look at XPLEX exmaple code
						//For AD ID we wait after so it can polute it with data (it wont return to the target app yet)
					}catch(e) {
						console.log("[" + mapper.className + ":transact] Exception: " + e);
					}
				},
				onLeave: function(retval) {
					try {
						let selfInstance = this.binderInstance; // not used, would allow accessing other BBinder instance functionality
						let code = this.code; // uint32_t
						let pData = this.pData;
						let pReply = this.pReply;
						let flags = this.flags; // uint32_t
						let isOneWay = (flags & FLAG_ONEWAY) > 0;
						let data = new CPPParcelEx(pData, mapper);
						let reply = new CPPParcelEx(pReply, mapper);
						
						//          let out = `${exp.name} called (code=${code}, pData=${pData}, pReply=${pReply}, flags=${flags} (oneWay: ${isOneWay}))`
						//console.log("Code=" + code + " pData=" + pData + " pReply=" + pReply + " Flags=" + flags + " OneWay=" + isOneWay);
						//console.log("\n\n");
						
						if (data !== null && data.dataSize() > 0) {
							data.savePosition();
							data.setDataPosition(12); //Skip first 12 Bytes (seems to be other data)
							let interfaceName = data.readString16();
							data.restorePosition();
							console.log("[" + mapper.className + "]");
							console.log(interfaceName + "\n");
							//To view a Dump of the Parcel you can do
							//data.dump();
						}
						
					}catch(e) {
						console.log("[" + mapper.className + ":transact] End Exception: " + e);
					}
				},
			});
		}
	}catch(e) {
		console.log("[E] [" + mapper.className + "] " + e);
	}
}

setTimeout(function() {
    Java.perform(function() {
		hookBpBinder();
    });
}, 0);
