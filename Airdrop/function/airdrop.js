/**
 * Created by zhaoyiyu on 2018/1/17.
 */

var Config = require('./../config/config.js');
var FileManager = require('./../airdrop_list/excelHandleManager');
Web3 = require('web3');
var web3 = new Web3(new Web3.providers.HttpProvider(Config.transaction.url));

//init
var Tx = require('ethereumjs-tx');
var ethjsaccount = require('ethjs-account');
var fs = require('fs');
var solc = require('solc');

// compile the code
var input = fs.readFileSync('./contract/airdrop.sol');
var output = solc.compile(input.toString());
var abi = JSON.parse(output.contracts[':TokenAirDrop'].interface);


var tokenInput = fs.readFileSync('./contract/erc20Token.sol');
var tokenOutput = solc.compile(tokenInput.toString());
var tokenAbi = JSON.parse(tokenOutput.contracts[':TokenERC20'].interface);
//------------------------------ init property ----------------------------

//airdrop contract address
var airContractAddress = Config.airdropModule.airdropContractAddress;
//user privateKey
var userPrivateKey = Config.airdropModule.userPrivateKey;
//erc20 token contract address
var tokenContractAddress = Config.airdropModule.tokenContractAddress;
//transfer from address
var transferFromAddress = Config.airdropModule.transferFromAddress;
//network type
var networkType = Config.internetType;

//-------------------------------- contract --------------------------------

var airdropContract = new web3.eth.Contract(abi, airContractAddress);

var tokenContract = new web3.eth.Contract(tokenAbi, tokenContractAddress);


// tokenContract.methods.name().call().then(console.log);
//
// tokenContract.methods.balanceOf('0x585a40461FF12C6734E8549A7FB527120D4b8d0D').call(null,function(error,result){
//     console.log("balance ->"+result);
// });

//-------------------------------- event --------------------------------

tokenContract.events.Transfer({
    fromBlock: 0,
    toBlock:'latest'
}, function(error, event){ console.log("result:\n"+JSON.stringify(event)); })
    .on('data', function(event){
        console.log(event); // same results as the optional callback above
    })
    .on('changed', function(event){
        // remove event from local database
    })
    .on('error', console.error);

//-------------------------------- function --------------------------------

var transfer = function(erc20TokenContractAddress , airDropOriginalAddress ,airdropDestinationAddresses, airdropAmounts,userPrivateKey,hashIdCallBack,success, error) {

    let fromAddress = privateKeyToAddress(userPrivateKey);

    //transaction config
    let t = {
        to: airContractAddress,
        value: '0x00',
        data: airdropContract.methods.airDrop(erc20TokenContractAddress,
            airDropOriginalAddress,
            airdropDestinationAddresses,
            airdropAmounts).encodeABI()
    };
    //get current gasPrice, you can use default gasPrice or custom gasPrice!
    web3.eth.getGasPrice().then(function(p) {
        //t.gasPrice = web3.utils.toHex(p);
        t.gasPrice = web3.utils.toHex(Config.transaction.gasPrice);
        //get nonce value
        web3.eth.getTransactionCount(fromAddress,
            function(err, r) {
                t.nonce = web3.utils.toHex(r);
                t.from = fromAddress;
                //get gasLimit value , you can use estimateGas or custom gasLimit!
                web3.eth.estimateGas(t,
                    function(err, gas) {
                        t.gasLimit = web3.utils.toHex(Config.transaction.gasLimit);
                        var tx = new Tx(t);
                        var privateKey = new Buffer(userPrivateKey, 'hex');

                        //sign
                        tx.sign(privateKey);
                        var serializedTx = '0x' + tx.serialize().toString('hex');
                        // console.log("serializedTx----"+serializedTx);

                        console.log("send signed transaction");

                        //sendSignedTransaction
                        web3.eth.sendSignedTransaction(serializedTx).on('transactionHash',function(hash){
                            console.log('hashId:'+ hash+'\n');
                            hashIdCallBack(hash);
                        }).on('receipt',function(receipt){
                            //console.log('receipt:'+ JSON.stringify(receipt));
                            let s = receipt.status;
                            console.log("resultStatus:"+s);
                            if (s != 1) {
                                error(JSON.stringify(receipt));
                            }
                            else {
                                success(JSON.stringify(receipt));
                            }
                        }).on('confirmation',function(confirmationNumber, receipt){

                            /*web3.eth.getBlockNumber(function (number) {
                             console.log("number--"+number+"\n");
                             });*/
                            //  console.log('entrance'+ JSON.stringify(confirmationNumber)+'--------------'+ JSON.stringify(receipt));
                        }).on('error',function(err){

                            //error(err);
                            console.log('send error'+err);
                        });
                    });
            });
        return this
    })
};


var privateKeyToAddress = function(privateKey) {

    var address = ethjsaccount.privateToAccount(privateKey).address;
    return address;
};


var totalAirdropAdress = [];
var totalAmounts = [];

var transferWithAddressAndAmounts = function(addresses,amounts) {

    for (let i in amounts){

        let amount = amounts[i].toString();
        let obj = web3.utils.toWei(amount, 'ether');
        totalAmounts.push(obj);
    }

    totalAirdropAdress = addresses;

    startHandleAirdrop(0);
};


var listen = require('./listen');

// ————————————  ✨✨The number of sent each time （200）✨✨✨  ————————————
const onceAmountOfAirdropList = 200;

function startHandleAirdrop(index) {

    console.log('\n');

    var currentAddresses = [];
    var currentAmounts = [];

    var airdropRecoder = [];

    var didSendLastAirdropList = false;

    for(i = index * onceAmountOfAirdropList ; i < (index +1) * onceAmountOfAirdropList ; i ++ ){

        var address = totalAirdropAdress[i];
        var amount = totalAmounts[i];

        currentAddresses.push(address);
        currentAmounts.push(amount);

        //append airdropList recoder
        var contentArr = [];
        contentArr.push(address);
        contentArr.push(amount);
        airdropRecoder.push(contentArr);

        //Judge whether the last batch has been sent out
        if (i === totalAirdropAdress.length - 1){
            didSendLastAirdropList = true;
            break;
        }
    }

    //console.log(currentAddresses +'\n'+currentAmounts);
    console.log(airdropRecoder);

    transfer(tokenContractAddress,transferFromAddress,currentAddresses,currentAmounts,userPrivateKey,function (hashId) {

        var parameter = {};
        if (networkType === 'main'){
            parameter = {'hashId':hashId};
        }else {
            parameter = {'hashId':hashId,'tokenAbi':tokenAbi,'tokenAddress':tokenContractAddress,'fromAddress':transferFromAddress}
        }

        listen.startListenAirdropResult(parameter,function (result) {

            console.log('\n\nThe '+(index+1)+' batch finished\n');

            //recoder excel
            var excelPath = Config.filePath.airdropRecoderListPath;
            FileManager.recoderAirdrop(airdropRecoder,excelPath);

            //Judge whether the last batch has been sent out
            if(didSendLastAirdropList){
                console.log("\nAll Token sent out!!!\n\n");
                listen.stopListen();
            }
            else {
                console.log('\nStart' + (index+2) + ' wave airdrop\n\n');
                startHandleAirdrop(index+1);
            }
        });
    },function (success) {

        console.log("Transaction Success:\n"+success);
    },function (error) {

        console.log("Failure to send a signature transaction:\n"+error);
        listen.stopListen();
    });
}

module.exports = {
    transferTool:transferWithAddressAndAmounts
};
