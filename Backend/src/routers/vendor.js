const express=require('express');
const router=new express.Router();
const RegistrationUtil=require('../helpers/Registration-helper');
const Vonage = require('@vonage/server-sdk');
const nodemailer=require('nodemailer');
const Manufacturer=require('../models/manufacturer');
const Vendor=require('../models/vendor');
const Rpf=require('../models/rfp');
const Agreement=require('../models/agreement');
const Helper=require('../helpers/helper');
const axios = require('axios').default;
const path=require('path');
const Rfp = require('../models/rfp');
const Bid = require('../models/Bid');

require('dotenv').config({path:path.resolve(__dirname, '../../.env') });

//Setting up functionality for message-based authentication
const vonage = new Vonage({
      apiKey: process.env.VKEY,
      apiSecret: process.env.SECRET
});

//Setting up functionality for email-based authentication
const transporter=nodemailer.createTransport({
      service: process.env.SECRET,
      auth:{
            user:process.env.TEST_MAIL,
            pass:process.env.TEST_PASS
      }
});

//Route-1:Temporary creation of a vendor in the database(T completed)
router.post('/vendor/signup1',async (req,res)=>{
      // console.log(req.body);
      const vendor=new Vendor(req.body);
      try{
            await vendor.save();
            vendor.Status=false;
            const response=await axios.get('https://geocode.search.hereapi.com/v1/geocode?q='+vendor.Address+'&apiKey='+process.env.API_KEY);
            const coordinates=Object.values(response.data.items[0].position);
            if (coordinates.length!=0)
            {            
                  await vendor.save();
                  res.status(201).send(vendor);
            }
            else
            {
                  await Vendor.findOneAndDelete({Email:req.body.Email});
                  res.status(400).send("Invalid Address");      
            }
      }catch(err){
            console.log(err);
            res.status(400).send();
      }
});

//Route-2:Permanent creation of a vendor in the database if OTP verification succeeds.(T completed)
router.post('/vendor/signup2',async (req,res)=>{
      // console.log(req.body);
      try{
            const vendor=await Vendor.findOne({Email:req.body.Email}) 
            if (vendor==undefined){
                  res.status(404).send();
            }
            else{
                  if (RegistrationUtil.Verificationutil(vendor,req)==true){
                        vendor.Status=true;
                        await vendor.RecentEmailOtps.pop();
                        await vendor.RecentMobileOtps.pop();
                        await vendor.save();
                        res.status(200).send(vendor);
                  }
                  else{
                        res.status(404).send(vendor);
                  }
            }
      }catch{
            res.status(400).send('Some error occured');
      }
});

//Route-3:Login setup for a vendor(T completed)
router.post('/vendor/login',async (req,res)=>{
      try{
            const vendor=await Vendor.findbycredentials(req.body.Email,req.body.password);
            if (vendor.Status==true){
                  res.status(200).send(vendor);
            }
            else{
                  res.status(403).send("You are not verified");
            }
      }catch(err){
            console.log(err);
            res.status(404).send("User not registered");
      }
});

//Route-4:Sending OTP
router.post('/vendor/newotps',async (req,res)=>{
      try{
            // console.log(req.body);
            const vendorEmail=req.body.Email;
            const vendor=await Vendor.findOne({Email:vendorEmail});
            if (vendor!==undefined && vendor.Status==false){
                  const otp1=RegistrationUtil.GetOtp();
                  const otp2=RegistrationUtil.GetOtp();
                  // const emailbody=RegistrationUtil.EmailBody(vendor.Email,otp1);
                  // const messagebody=RegistrationUtil.MessageBody(otp2);
                  // let emailinfo=await transporter.sendMail(emailbody);
                  // let messageinfo=await vonage.message.sendSms('Team',"91"+vendor.PhoneNumber,messagebody);
                  await vendor.RecentEmailOtps.push(otp1);
                  await vendor.RecentMobileOtps.push(otp2);
                  await vendor.save();
                  res.status(200).send();
            }
            else if (vendor===undefined){
                  res.status(404).send("You are not registered!");
            }
            else{
                  res.status(400).send("User is already verified");
            }
      }catch{
            res.status(404).send();
      }
});

// Route-5: Sending all kind of appointments
router.post('/vendor/agreements',async(req,res)=>{
      try{
            const allagreements=await Agreement.find({Manufacturer_id:req.body.id});
            let Live_Agreements=[],Upcoming_Agreements=[],Completed_Agreements=[];
            for(let i=0;i<allagreements.length;i++){
                  const startdate=allagreements[i].StartDate;
                  const enddate=allagreements[i].EndDate;
                  if (Helper.comparedatecurr(startdate)==0)
                  {
                        Upcoming_Agreements.push(Helper.retobj1(allagreements[i]));
                  }
                  else if (Helper.comparedatecurr(enddate)==1)
                  {
                        Completed_Agreements.push(Helper.retobj1(allagreements[i]));
                  }
                  else{
                        Live_Agreements.push(Helper.retobj1(allagreements[i]));
                  }
            }
            res.status(200).send({Upcoming_Agreements,Live_Agreements,Completed_Agreements});
      }catch(err){
            console.log(err);
            res.status(400).send();
      }
})

//Route-6: 
router.post('/vendor/list',async (req,res)=>{
      try{
            let s1=new Set(req.body.Services);
            const allrfps=await Rpf.find({});
            let s2=new Set();
            for(let i=0;i<allrfps.length;i++){
                  s2.add(allrfps[i].Product_Name);
            }
            let intersetion=new Set([...s1].filter(i=>s2.has(i)));
            const ret=Array.from(intersetion);
            res.status(200).send(ret);
      }catch(err){
            console.log(err);
            res.status(400).send();
      }
})

//Route-6:Giving out all cards
router.post('/vendor/allvalidrfps',async (req,res)=>{
      try{  
            const allsemivalidrfps=await Rfp.find({Product_Name:req.body.Product});
            let ret=[];
            for(let i=0;i<allsemivalidrfps.length;i++){
                  let found=allsemivalidrfps[i].Action_taken.find(e=>(e.vendor_id==req.body.Vendor_id));
                  if (found==undefined)
                  {
                        const currmanu=await Manufacturer.findOne({_id:allsemivalidrfps[i].Manufacturer_id});
                        ret.push({
                              Product:allsemivalidrfps[i].Product_Name,
                              Unit:allsemivalidrfps[i].Unit,
                              Price_Per_Unit:allsemivalidrfps[i].Cost_per_Unit,
                              StartDate:allsemivalidrfps[i].StartDate,
                              EndDate:allsemivalidrfps[i].EndDate,
                              DeadlineDate:allsemivalidrfps[i].DeadlineDate,
                              Total_Quantity:allsemivalidrfps[i].Total_Quantity_required,
                              Mode_Of_Delivery:allsemivalidrfps[i].ModeofDelivery,
                              Manufacturer:currmanu.CompanyName,
                              Manufacturer_Address:currmanu.Address,     
                              Manufacturer_id:allsemivalidrfps[i].Manufacturer_id,
                              Rfp_id:allsemivalidrfps[i]._id        
                        })
                  }
            }
            res.status(200).send(ret);
      }catch(err){
            console.log(err);
            res.status(400).send();
      } 
})

//Route-7: Accepting a bid and changing status
router.post('/vendor/firstacceptforconsideration',async (req,res)=>{
      try{
            const rfp_id=req.body.Rpf_id;
            const Vendor_id=req.body.Vendor_id;
            const Manufacturer_id=req.body.Manufacturer_id;
            const newbid=new Bid({
                  vendor_id:Vendor_id,
                  manufacturer_id:Manufacturer_id,
                  rfp_id:rfp_id
            });
            const currrfp=await Rfp.findOne({_id:rfp_id});
            currrfp.Action_taken.push({vendor_id:Vendor_id});
            await currrfp.save();
            newbid.Status=true;    
            await newbid.save();
            res.status(200).send();
      }catch(err){
            console.log(err);
            res.status(400).send();
      }
})

//Route-8 Proposing a negotiation
router.post('/vendor/firstsubmitnego',async(req,res)=>{
      try{
            const rfp_id=req.body.Rpf_id;
            const Vendor_id=req.body.Vendor_id;
            const Manufacturer_id=req.body.Manufacturer_id;
            const newbid=new Bid({
                  vendor_id:Vendor_id,
                  manufacturer_id:Manufacturer_id,
                  rfp_id:rfp_id
            });
            const currrfp=await Rfp.findOne({_id:rfp_id});
            currrfp.Action_taken.push({vendor_id:Vendor_id});
            await currrfp.save();
            newbid.Status=true;    
            newbid.All_negotiations.push({
                  Quote_Cost_per_Unit:req.body.Price_Per_Unit,
                  Quote_ModeofDelivery:req.body.Mode_Of_Delivery,
                  Quote_Owner:Vendor_id
            })
            res.status(200).send();
      }catch(err){
            console.log(err);
            res.status(400).send();
      }
})

//Route-6:Logging a user out
router.post('/vendor/logout',async (req,res)=>{
      try{
            req.user.RecentEmailOtps=[];
            req.user.RecentMobileOtps=[];
            await req.user.save();
            res.status(200).send();
      }catch(err){
            console.log(err);
            res.status(400).send(err);
      }
})

module.exports =router;