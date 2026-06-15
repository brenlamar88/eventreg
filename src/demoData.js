// Demo mode data — realistic mock data for pitching to prospective event organizers.
// Nothing here touches any real database or API.

export const DEMO_LOTS = [
  // Elite Registry
  { id:"d-1",  lotNo:"1",   description:"Blackbuck Antelope - 2 Year Old Buck",         category:"Elite Registry",        consignorName:"Lone Star Exotics",   consignorRanch:"Lone Star Exotics",   buyerName:"River Bend Ranch",  buyerRanch:"River Bend Ranch",  amount:4800,  amountPaid:4800,  donated:false, delivered:true,  checkNo:"1021", checkDate:"2026-06-10", buyerPaid:true,  paymentMethod:"check" },
  { id:"d-2",  lotNo:"2",   description:"Axis Deer - 3x3 Buck with Drop Tines",         category:"Elite Registry",        consignorName:"Hill Country Wildlife",consignorRanch:"Hill Country Wildlife",buyerName:"Palmetto Preserve",  buyerRanch:"Palmetto Preserve", amount:6200,  amountPaid:6200,  donated:false, delivered:true,  checkNo:"1022", checkDate:"2026-06-10", buyerPaid:true,  paymentMethod:"card"  },
  { id:"d-3",  lotNo:"3",   description:"Scimitar Oryx Pair - Breeding Age",             category:"Elite Registry",        consignorName:"Desert Wind Ranch",   consignorRanch:"Desert Wind Ranch",   buyerName:"Magnolia Farms",    buyerRanch:"Magnolia Farms",    amount:9500,  amountPaid:9500,  donated:false, delivered:true,  checkNo:"1023", checkDate:"2026-06-11", buyerPaid:true,  paymentMethod:"check" },
  { id:"d-4",  lotNo:"4",   description:"Gemsbok - Full-Curl Male",                      category:"Elite Registry",        consignorName:"Lone Star Exotics",   consignorRanch:"Lone Star Exotics",   buyerName:"Blue Ridge Wildlife",buyerRanch:"Blue Ridge Wildlife",amount:7200,  amountPaid:0,     donated:false, delivered:false, checkNo:"",     checkDate:"",           buyerPaid:false, paymentMethod:"cash"  },
  { id:"d-5",  lotNo:"5",   description:"Impala - 4-Head Mixed Group",                   category:"Elite Registry",        consignorName:"Sunset Valley Ranch", consignorRanch:"Sunset Valley Ranch", buyerName:"",                  buyerRanch:"",                  amount:3400,  amountPaid:0,     donated:false, delivered:false, checkNo:"",     checkDate:"",           buyerPaid:false, paymentMethod:"cash"  },
  { id:"d-6",  lotNo:"6",   description:"Fallow Deer - Chocolate Buck",                  category:"Elite Registry",        consignorName:"Hill Country Wildlife",consignorRanch:"Hill Country Wildlife",buyerName:"Timber Creek Lodge", buyerRanch:"Timber Creek Lodge",amount:5100,  amountPaid:5100,  donated:false, delivered:true,  checkNo:"1024", checkDate:"2026-06-11", buyerPaid:true,  paymentMethod:"check" },
  // Exotic Conservation
  { id:"d-7",  lotNo:"20",  description:"Arabian Oryx - Young Female",                   category:"Exotic Conservation",   consignorName:"Desert Wind Ranch",   consignorRanch:"Desert Wind Ranch",   buyerName:"Magnolia Farms",    buyerRanch:"Magnolia Farms",    amount:11500, amountPaid:11500, donated:false, delivered:true,  checkNo:"1025", checkDate:"2026-06-11", buyerPaid:true,  paymentMethod:"wire"  },
  { id:"d-8",  lotNo:"21",  description:"Addax - Breeding Pair",                         category:"Exotic Conservation",   consignorName:"Sunset Valley Ranch", consignorRanch:"Sunset Valley Ranch", buyerName:"Blue Ridge Wildlife",buyerRanch:"Blue Ridge Wildlife",amount:14000, amountPaid:0,     donated:false, delivered:false, checkNo:"",     checkDate:"",           buyerPaid:false, paymentMethod:"cash"  },
  { id:"d-9",  lotNo:"22",  description:"Dama Gazelle - 3-Head Group",                   category:"Exotic Conservation",   consignorName:"Lone Star Exotics",   consignorRanch:"Lone Star Exotics",   buyerName:"River Bend Ranch",  buyerRanch:"River Bend Ranch",  amount:18000, amountPaid:18000, donated:false, delivered:true,  checkNo:"1026", checkDate:"2026-06-12", buyerPaid:true,  paymentMethod:"check" },
  // Grand Auction
  { id:"d-10", lotNo:"300", description:"7-Day African Safari Package - 2 Hunters",      category:"Grand Auction",         consignorName:"African Quest Safaris",consignorRanch:"African Quest Safaris",buyerName:"Wade Thompson",     buyerRanch:"Thompson Ranch",    amount:22000, amountPaid:22000, donated:false, delivered:false, checkNo:"",     checkDate:"",           buyerPaid:true,  paymentMethod:"card"  },
  { id:"d-11", lotNo:"301", description:"Custom 1911 Pistol - Hand Engraved",             category:"Grand Auction",         consignorName:"Texas Custom Arms",   consignorRanch:"Texas Custom Arms",   buyerName:"Danny Broussard",   buyerRanch:"Broussard Farms",   amount:8500,  amountPaid:8500,  donated:false, delivered:false, checkNo:"",     checkDate:"",           buyerPaid:true,  paymentMethod:"check" },
  { id:"d-12", lotNo:"302", description:"Hunting Lease Rights - 5,000 Acres, 3 Seasons", category:"Grand Auction",         consignorName:"Reata Land & Cattle", consignorRanch:"Reata Land & Cattle", buyerName:"",                  buyerRanch:"",                  amount:15000, amountPaid:0,     donated:false, delivered:false, checkNo:"",     checkDate:"",           buyerPaid:false, paymentMethod:"cash"  },
  { id:"d-13", lotNo:"303", description:"Luxury Ranch Getaway - 10 Guests, 3 Nights",    category:"Grand Auction",         consignorName:"Brazos River Lodge",  consignorRanch:"Brazos River Lodge",  buyerName:"Jennifer Mouton",   buyerRanch:"Mouton Family",     amount:12000, amountPaid:12000, donated:false, delivered:false, checkNo:"",     checkDate:"",           buyerPaid:true,  paymentMethod:"card"  },
  { id:"d-14", lotNo:"304", description:"Helicopter Deer Survey - 1,000 Acres",           category:"Grand Auction",         consignorName:"TexAir Ag Services",  consignorRanch:"TexAir Ag Services",  buyerName:"",                  buyerRanch:"",                  amount:4500,  amountPaid:0,     donated:false, delivered:false, checkNo:"",     checkDate:"",           buyerPaid:false, paymentMethod:"cash"  },
  // Donated
  { id:"d-15", lotNo:"99",  description:"EWA Signed Print - Artist Proof #4/10",          category:"Donated",               consignorName:"EWA Louisiana",       consignorRanch:"EWA Louisiana",       buyerName:"Marcus LeBlanc",    buyerRanch:"LeBlanc Ranch",     amount:1200,  amountPaid:1200,  donated:true,  delivered:true,  checkNo:"",     checkDate:"",           buyerPaid:true,  paymentMethod:"cash"  },
  { id:"d-16", lotNo:"100", description:"Custom Hunting Knife - Damascus Blade",           category:"Donated",               consignorName:"Hill Country Wildlife",consignorRanch:"Hill Country Wildlife",buyerName:"",                  buyerRanch:"",                  amount:800,   amountPaid:0,     donated:true,  delivered:false, checkNo:"",     checkDate:"",           buyerPaid:false, paymentMethod:"cash"  },
  // Raffle
  { id:"d-17", lotNo:"R1",  description:"Raffle - 4-Wheeler ATV (Yamaha Grizzly)",        category:"Raffle",                consignorName:"EWA Louisiana",       consignorRanch:"EWA Louisiana",       buyerName:"Tommy Fontenot",    buyerRanch:"Fontenot Farm",     amount:9800,  amountPaid:9800,  donated:false, delivered:false, checkNo:"",     checkDate:"",           buyerPaid:true,  paymentMethod:"cash"  },
  { id:"d-18", lotNo:"R2",  description:"Raffle - Yeti Cooler Bundle",                    category:"Raffle",                consignorName:"EWA Louisiana",       consignorRanch:"EWA Louisiana",       buyerName:"",                  buyerRanch:"",                  amount:1800,  amountPaid:0,     donated:false, delivered:false, checkNo:"",     checkDate:"",           buyerPaid:false, paymentMethod:"cash"  },
  // Fuller Family
  { id:"d-19", lotNo:"F1",  description:"Fuller Legacy Bull - Pureblood Watusi",          category:"Fuller Family",         consignorName:"Fuller Cattle Co.",   consignorRanch:"Fuller Cattle Co.",   buyerName:"Blue Ridge Wildlife",buyerRanch:"Blue Ridge Wildlife",amount:16500, amountPaid:0,     donated:false, delivered:false, checkNo:"",     checkDate:"",           buyerPaid:false, paymentMethod:"cash"  },
  { id:"d-20", lotNo:"F2",  description:"Fuller Family Reserve Heifer Pair",               category:"Fuller Family",         consignorName:"Fuller Cattle Co.",   consignorRanch:"Fuller Cattle Co.",   buyerName:"Timber Creek Lodge", buyerRanch:"Timber Creek Lodge",amount:21000, amountPaid:21000, donated:false, delivered:true,  checkNo:"1027", checkDate:"2026-06-12", buyerPaid:true,  paymentMethod:"check" },
].map(r => ({
  ...r,
  consignor: r.consignorRanch ? `${r.consignorName} — ${r.consignorRanch}` : r.consignorName,
  buyer: r.buyerName ? (r.buyerRanch ? `${r.buyerName} — ${r.buyerRanch}` : r.buyerName) : "—",
}));

export const DEMO_PEOPLE = [
  { name:"Wade Thompson",   ranch:"Thompson Ranch",    bidderNo:"1",  email:"wade@thompsonranch.com" },
  { name:"Danny Broussard", ranch:"Broussard Farms",   bidderNo:"2",  email:"danny@broussardfarms.com" },
  { name:"Jennifer Mouton", ranch:"Mouton Family",     bidderNo:"3",  email:"jennifer@moutonfamily.com" },
  { name:"Marcus LeBlanc",  ranch:"LeBlanc Ranch",     bidderNo:"4",  email:"marcus@leblancranch.com" },
  { name:"Tommy Fontenot",  ranch:"Fontenot Farm",     bidderNo:"5",  email:"tommy@fontenotfarm.com" },
  { name:"River Bend Ranch",ranch:"River Bend Ranch",  bidderNo:"6",  email:"info@riverbendfarm.com" },
  { name:"Palmetto Preserve",ranch:"Palmetto Preserve",bidderNo:"7",  email:"info@palmetto.com" },
  { name:"Magnolia Farms",  ranch:"Magnolia Farms",    bidderNo:"8",  email:"info@magnoliafarms.com" },
  { name:"Blue Ridge Wildlife",ranch:"Blue Ridge Wildlife",bidderNo:"9",email:"info@blueridge.com" },
  { name:"Timber Creek Lodge",ranch:"Timber Creek Lodge",bidderNo:"10",email:"info@timbercreek.com" },
];

export const DEMO_REGISTRANTS = [
  { id:"r1",  name:"Wade Thompson",    email:"wade@thompsonranch.com",    phone:"337-555-0101", ranch:"Thompson Ranch",     sponsor_name:"Gulf Coast Seed & Feed", party:2, status:"paid",    source:"online", amount:200, checked_in:true,  bidder_number:"1",  created_at:"2026-04-12" },
  { id:"r2",  name:"Danny Broussard",  email:"danny@broussardfarms.com",  phone:"337-555-0102", ranch:"Broussard Farms",    sponsor_name:null,                     party:4, status:"paid",    source:"online", amount:400, checked_in:true,  bidder_number:"2",  created_at:"2026-04-14" },
  { id:"r3",  name:"Jennifer Mouton",  email:"jennifer@moutonfamily.com", phone:"337-555-0103", ranch:"Mouton Family",      sponsor_name:"Acadian Equipment Co.",  party:2, status:"paid",    source:"phone",  amount:200, checked_in:true,  bidder_number:"3",  created_at:"2026-04-15" },
  { id:"r4",  name:"Marcus LeBlanc",   email:"marcus@leblancranch.com",   phone:"337-555-0104", ranch:"LeBlanc Ranch",      sponsor_name:null,                     party:1, status:"paid",    source:"online", amount:100, checked_in:true,  bidder_number:"4",  created_at:"2026-04-20" },
  { id:"r5",  name:"Tommy Fontenot",   email:"tommy@fontenotfarm.com",    phone:"337-555-0105", ranch:"Fontenot Farm",      sponsor_name:null,                     party:3, status:"paid",    source:"online", amount:300, checked_in:false, bidder_number:"5",  created_at:"2026-04-22" },
  { id:"r6",  name:"Sarah Guidry",     email:"sarah@guidryranch.com",     phone:"337-555-0106", ranch:"Guidry Ranch",       sponsor_name:"Gulf Coast Seed & Feed", party:2, status:"paid",    source:"online", amount:200, checked_in:true,  bidder_number:"6",  created_at:"2026-04-25" },
  { id:"r7",  name:"Paul Thibodaux",   email:"paul@thibodaux.net",        phone:"337-555-0107", ranch:"Thibodaux Exotics",  sponsor_name:null,                     party:1, status:"paid",    source:"phone",  amount:100, checked_in:true,  bidder_number:"7",  created_at:"2026-05-01" },
  { id:"r8",  name:"Angela Castille",  email:"angela@castille.com",       phone:"337-555-0108", ranch:"Castille Wildlife",  sponsor_name:"Acadian Equipment Co.",  party:2, status:"paid",    source:"online", amount:200, checked_in:false, bidder_number:"8",  created_at:"2026-05-03" },
  { id:"r9",  name:"Ray Arceneaux",    email:"ray@arceneaux.com",         phone:"337-555-0109", ranch:"Arceneaux Farms",    sponsor_name:null,                     party:4, status:"paid",    source:"online", amount:400, checked_in:true,  bidder_number:"9",  created_at:"2026-05-05" },
  { id:"r10", name:"Cindy Boudreaux",  email:"cindy@boudreauxranch.com",  phone:"337-555-0110", ranch:"Boudreaux Ranch",    sponsor_name:null,                     party:1, status:"pending", source:"phone",  amount:0,   checked_in:false, bidder_number:"10", created_at:"2026-05-10" },
  { id:"r11", name:"Todd Hebert",      email:"todd@hebertfarm.com",       phone:"337-555-0111", ranch:"Hebert Farm",        sponsor_name:null,                     party:2, status:"paid",    source:"online", amount:200, checked_in:true,  bidder_number:"11", created_at:"2026-05-12" },
  { id:"r12", name:"Monique Trahan",   email:"monique@trahan.com",        phone:"337-555-0112", ranch:"Trahan Wildlife",    sponsor_name:null,                     party:1, status:"paid",    source:"online", amount:100, checked_in:false, bidder_number:"12", created_at:"2026-05-15" },
];

export const DEMO_SPONSORS = [
  { id:"s1", name:"Gulf Coast Seed & Feed",   tier:"Presenting", amount:15000, status:"paid",    contact_name:"Bill Fontenot",   contact_email:"bill@gcsfeed.com",        contact_phone:"337-555-2001", notes:"Booth at event, logo on banner" },
  { id:"s2", name:"Acadian Equipment Co.",    tier:"Platinum",   amount:10000, status:"paid",    contact_name:"Claire Mouton",   contact_email:"claire@acadianequip.com", contact_phone:"337-555-2002", notes:"Annual sponsor since 2019" },
  { id:"s3", name:"Cajun Country Taxidermy",  tier:"Gold",       amount:5000,  status:"paid",    contact_name:"Dave Trosclair",  contact_email:"dave@cajuntaxidermy.com", contact_phone:"337-555-2003", notes:"In-kind sponsorship approved" },
  { id:"s4", name:"Bayou State Bank",         tier:"Silver",     amount:2500,  status:"pending", contact_name:"Lisa Broussard",  contact_email:"lisa@bayoubank.com",      contact_phone:"337-555-2004", notes:"Invoice sent 5/20" },
  { id:"s5", name:"Pelican Feed & Supply",    tier:"Bronze",     amount:1000,  status:"paid",    contact_name:"Gene Thibodaux",  contact_email:"gene@pelicanfeed.com",    contact_phone:"337-555-2005", notes:"" },
  { id:"s6", name:"Acadiana Veterinary Svc.", tier:"Supporter",  amount:500,   status:"paid",    contact_name:"Dr. Amy Leger",   contact_email:"amy@acadianavets.com",    contact_phone:"337-555-2006", notes:"" },
];

export const DEMO_LOT_FEE = 50;
