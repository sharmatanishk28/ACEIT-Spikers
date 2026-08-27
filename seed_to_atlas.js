/**
 * seed_to_atlas.js — Seeds all local data.json into MongoDB Atlas
 * Run: node seed_to_atlas.js
 */
require("dotenv").config();
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const fs = require("fs");
const path = require("path");

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) { console.error("ERROR: MONGODB_URI not set in .env"); process.exit(1); }

const clubSchema = new mongoose.Schema({ key:{type:String,default:"main",unique:true},team:{type:Array,default:[]},matches:{type:Array,default:[]},news:{type:Array,default:[]},sponsors:{type:Array,default:[]},testimonials:{type:Array,default:[]},stats:{type:Array,default:[]},gallery:{type:Array,default:[]},events:{type:Array,default:[]},training:{type:Array,default:[]},slideshow:{type:Array,default:[]},about:{type:Object,default:{}},contact:{type:Object,default:{}},abouts:{type:Object,default:{}},contacts:{type:Object,default:{}},deletedCategories:{type:Object,default:{}},categories:{type:Object,default:{}},customCategories:{type:Object,default:{}},pin:{type:String,default:"2027"}},{timestamps:true});
const ClubDoc = mongoose.models.ClubDoc || mongoose.model("ClubDoc", clubSchema);

const clubItemSchema = new mongoose.Schema({clubId:{type:String,required:true,unique:true,lowercase:true,trim:true},slug:{type:String,lowercase:true,trim:true},name:{type:String,required:true,trim:true},sport:{type:String,trim:true},logo:{type:String,default:""},loaderLogo:{type:String,default:""},coverImage:{type:String,default:""},description:{type:String,default:""},themeColor:{type:String,default:""},accentColor:{type:String,default:""},active:{type:Boolean,default:true},status:{type:String,default:"active"}},{timestamps:true});
const Club = mongoose.models.Club || mongoose.model("Club", clubItemSchema);

const userSchema = new mongoose.Schema({name:{type:String,required:true},username:{type:String,required:true,unique:true,lowercase:true,trim:true},rtuRollNo:{type:String,trim:true,default:""},email:{type:String,default:"",lowercase:true,trim:true},mobile:{type:String,default:"",trim:true},photo:{type:String,default:""},passwordHash:{type:String,required:true},role:{type:String,default:"STUDENT"},clubId:{type:String,default:"ALL"},clubs:{type:[String],default:["spikers"]},bio:{type:String,default:""},sport:{type:String,default:""},branch:{type:String,default:"Computer Science & Engineering",trim:true},year:{type:String,default:"3rd Year",trim:true},position:{type:String,default:"",trim:true},jerseyNo:{type:String,default:"",trim:true},height:{type:String,default:"",trim:true},achievements:{type:Array,default:[]},stats:{matchesPlayed:{type:Number,default:0},points:{type:Number,default:0},spikes:{type:Number,default:0},blocks:{type:Number,default:0},aces:{type:Number,default:0},mvpAwards:{type:Number,default:0},mvpPoints:{type:Number,default:0}},badges:{type:Array,default:[]},permissions:{type:[String],default:[]},active:{type:Boolean,default:true},lastLoginAt:{type:Date}},{timestamps:true});
const User = mongoose.models.User || mongoose.model("User", userSchema);

async function seed() {
  console.log("\n============================================================");
  console.log(" ACEIT Spikers — Full MongoDB Atlas Seed");
  console.log("============================================================\n");
  await mongoose.connect(MONGODB_URI, { dbName:"spikers", serverSelectionTimeoutMS:12000 });
  console.log("Connected to MongoDB Atlas (spikers database)\n");

  const raw = JSON.parse(fs.readFileSync(path.join(__dirname,"data.json"),"utf8"));
  console.log("Local data.json:", Object.keys(raw).map(k=>k+":"+(Array.isArray(raw[k])?raw[k].length:typeof raw[k])).join(" | "));

  // 1. Seed main ClubDoc
  await ClubDoc.findOneAndUpdate({key:"main"},{team:raw.team||[],matches:raw.matches||[],news:raw.news||[],sponsors:raw.sponsors||[],testimonials:raw.testimonials||[],stats:raw.stats||[],gallery:raw.gallery||[],events:raw.events||[],training:raw.training||[],slideshow:raw.slideshow||[],about:raw.about||{},contact:raw.contact||{},abouts:raw.abouts||{},contacts:raw.contacts||{},deletedCategories:raw.deletedCategories||{},categories:raw.categories||{},customCategories:raw.customCategories||{},pin:process.env.ADMIN_PIN||"2027"},{upsert:true,new:true});
  console.log("Main ClubDoc seeded (players, matches, news, events, gallery, training, slideshow)");

  // 2. Seed Clubs
  for (const club of (raw.clubs||[])) {
    const slug=(club.slug||club.clubId||"").toLowerCase().trim();
    if(!slug) continue;
    await Club.findOneAndUpdate({clubId:slug},{clubId:slug,slug,name:club.name||slug,sport:club.sport||"",logo:club.logo||"",loaderLogo:club.loaderLogo||"",coverImage:club.coverImage||"",description:club.description||"",themeColor:club.themeColor||"",accentColor:club.accentColor||"",active:club.active!==false,status:club.status||"active"},{upsert:true,new:true});
    console.log("  Club: "+club.name+" ["+slug+"]");
  }

  // 3. Seed Users
  for (const u of (raw.users||[])) {
    const username=(u.username||"").toLowerCase().trim();
    if(!username) continue;
    let passwordHash=u.passwordHash||"";
    if(!passwordHash.startsWith("$2")) passwordHash=bcrypt.hashSync(username,10);
    await User.findOneAndUpdate({username},{name:u.name||username,username,rtuRollNo:u.rtuRollNo||"",email:u.email||"",mobile:u.mobile||"",photo:u.photo||"",passwordHash,role:(u.role||"STUDENT").toUpperCase(),clubId:u.clubId||"ALL",clubs:Array.isArray(u.clubs)?u.clubs:["spikers"],bio:u.bio||"",sport:u.sport||"",branch:u.branch||"Computer Science & Engineering",year:u.year||"3rd Year",position:u.position||"",jerseyNo:u.jerseyNo||"",height:u.height||"",achievements:u.achievements||[],permissions:u.permissions||["profile.view","profile.edit","clubs.join"],active:u.active!==false},{upsert:true,new:true});
    console.log("  User: "+u.name+" ["+username+"] — "+(u.role||"STUDENT").toUpperCase());
  }

  // 4. Summary
  const doc=await ClubDoc.findOne({key:"main"});
  const clubs=await Club.countDocuments();
  const users=await User.find({},{name:1,username:1,role:1,rtuRollNo:1,mobile:1,email:1});
  console.log("\n============================================================");
  console.log(" SEED COMPLETE");
  console.log("============================================================");
  if(doc){
    console.log("  Players in Atlas  : "+(doc.team||[]).length);
    console.log("  Matches           : "+(doc.matches||[]).length);
    console.log("  News              : "+(doc.news||[]).length);
    console.log("  Events            : "+(doc.events||[]).length);
    console.log("  Gallery           : "+(doc.gallery||[]).length);
    console.log("  Training          : "+(doc.training||[]).length);
    console.log("  Slideshow         : "+(doc.slideshow||[]).length);
  }
  console.log("  Clubs in Atlas    : "+clubs);
  console.log("  Users in Atlas    : "+users.length);
  console.log("\n  Users:");
  users.forEach(u=>console.log("    - "+u.name+" ["+u.username+"] | "+u.role+" | Roll: "+(u.rtuRollNo||"N/A")+" | Mobile: "+(u.mobile||"N/A")+" | Email: "+(u.email||"N/A")));
  console.log("\nAll done! MongoDB Atlas fully seeded.\n");
  await mongoose.disconnect();
  process.exit(0);
}
seed().catch(err=>{ console.error("SEED FAILED:", err.message); process.exit(1); });
