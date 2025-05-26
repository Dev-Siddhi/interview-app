console.log("server.js file loaded");
import express from "express";
import https from "https";
import fs from "fs";
import path from "path";
import { Server } from "socket.io";
import { fileURLToPath } from "url";
import mongoose from "mongoose";


const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// const interviewFile = path.join(__dirname, "interview.json");
const options = {
  key: fs.readFileSync("./certs/key.pem"),
  cert: fs.readFileSync("./certs/cert.pem"),
};

const app = express();
const httpsServer = https.createServer(options, app);
const io = new Server(httpsServer);
app.use(express.static(path.join(__dirname, "public")));

let users = {};
let rooms = {};

// when a user connects
io.on("connection", (socket) => {
  console.log("client connected", socket.id);

  // interviewer login
  socket.on("interviewerLogin", (username) => {
    users[socket.id] = username;
  });

  // interviewee login
  socket.on("intervieweeLogin", (username) => {
    users[socket.id] = username;
  });

   // Create a room by the interviewer
  socket.on("createRoom", ({ roomId, username }) => {
    rooms[roomId] = {
      interviewer: socket.id,
      interviewerName: username,
      interviewee: null,
      createdAt: Date.now(), 
      timeout: null,
    };

    // Join interviewer to the room 
    socket.join(roomId);
    socket.emit("roomCreated", { roomId });

    // Auto-delete room after an hour if interviewee doesn't join
    rooms[roomId].timeout = setTimeout(() => {
      if (rooms[roomId] && !rooms[roomId].interviewee) {
        rooms[roomId].interviewee = null;
        delete rooms[roomId];
        socket.leave(roomId);
        socket.emit("roomExpired", { roomId });
      }
    }, 3600000); //1hr
  });

  // Interviewee attempts to join a room
  socket.on("join-Room", ({ roomId, username }) => {
    if (!rooms[roomId]) {
      return socket.emit("error", { message: `Room ID does not exist.` });
    }

    // Check if interviewee already joined
    if (rooms[roomId].interviewee) {
      return socket.emit("error", {
        message: "Room already has an interviewee.",
      });
    }

     // Register the interviewee and join the room
    rooms[roomId].interviewee = socket.id;
    socket.join(roomId);

    // Cancel auto-delete timer
    if (rooms[roomId].timeout) {
      clearTimeout(rooms[roomId].timeout);
      rooms[roomId].timeout = null;
    }

    const interviewerName = rooms[roomId]?.interviewerName || "Unknown";
    const intervieweeName = username;

    // Save past interview to file
    pastInterview(interviewerName, intervieweeName);

    // Notify both users
    socket.emit("joinedRoom", { roomId });
    io.to(rooms[roomId].interviewer).emit("intervieweeJoined", {
      user: username,
    });
    io.to(socket.id).emit("interviewerAlreadyPresent", {
      message: `${rooms[roomId].interviewerName} is already in the room.`,
    });
  });

  //handle chat message
  socket.on("chat message", ({ roomId, data }) => {
    const sender = data.sender;
    const { message } = data;
    io.to(roomId).emit("chat message", { sender, message });
  });

  // handle monaco editor
  socket.on("code-change", ({ roomId, code }) => {
    socket.to(roomId).emit("code-update", code);
  });

  // video call
  // web RTC signaling
  socket.on("offer", ({ roomId, offer }) => {
    socket.to(roomId).emit("offer", { roomId, offer });
  });

  socket.on("answer", ({ roomId, answer }) => {
    socket.to(roomId).emit("answer", { roomId, answer });
  });

  socket.on("ice-candidate", ({ roomId, candidate }) => {
    socket.to(roomId).emit("ice-candidate", { roomId, candidate });
  });

  // notify when call ends
  socket.on("call-ended", (roomId) => {
    console.log(`📞 Call ended by: ${socket.id}`);
    socket.to(roomId).emit("call-ended"); // Sends to all other users
  });

  // Handle disconnection
  socket.on("disconnect", () => {
    console.log("Client disconnected:", socket.id);
 });

  // Remove user from users list on disconnect
  for (let username in users) {
    if (socket.id === socket.id) {
      delete users[username];
      console.log(`${username} was removed from active users on disconnect.`);
    }
  }
});


// connects mongodb database
mongoose.connect("mongodb://localhost:27017/interviewsDB")

// console if succefully connected 
const db = mongoose.connection;
db.on("connected",()=>{
  console.log("connected to mongodb")
})

// console err in case of error occurence
db.on("error",(err)=>{
  console.error("mongodb connection error:",err)
})


// mongodb schema
const interviewSchema = new mongoose.Schema({
  interviewer: String,
  interviewee:String,
  time:{
    type:Date,
    default:Date.now}
})

// creating model to interact with database for CRUD operations 
const interviewModel = mongoose.model("interview",interviewSchema)


// Save interview history to JSON file
async function pastInterview(interviewer, interviewee) {
  try {
    // create and save interviews 
    const interview = new interviewModel({ interviewer, interviewee });
    await interview.save();   
  }
  // console error 
   catch (error) {
    console.error("❌ Error saving interview:", error);
  }
}


// API to fetch all interviews related to a specific user
app.get("/interviews/:username", async (req, res) => {
  
  // extract username
  const username = req.params.username.trim().toLowerCase();

  // find interviews by username matches interviewer or interviewee (case-insensitive)
  try {
    const results = await interviewModel.find({
      $or: [
        { interviewer: new RegExp(`^${username}$`, "i") },
        { interviewee: new RegExp(`^${username}$`, "i") }
      ]
    })
    // Convert results to plain objects and add 'id' field
  const formatted = results.map(i=>({...i.toObject(),id:i._id}))

  // send formatted data as json responce
    res.json(formatted);
  } 
  catch (err) {
  // handle and respond with server error 
    console.error("Error fetching interviews:", err);
    res.status(500).json({ message: "Internal server error" });
  }
});


// API to delete an interview by ID
app.delete("/interviews/:id", async (req, res) => {
  // get id from the url
  const id = req.params.id;
 
  try{
    // find and delete the interview by id 
    const result = await interviewModel.findByIdAndDelete(id)
  
    // if not found send 404 responce 
    if(!result){
    return res.status(404).json({success:false,message:"Interview not found"})
   }

  //  if deleted successfully send confirmation
   res.json({success: true,message:"interview deleted"})
  }
  // handle any error during deletion
  catch(err){
    console.error("error deleting interview",err)
    res.status(500).json({message:"error deleting interview"})
  }
});

httpsServer.listen(4000, () => {
  console.log(`HTTPS server running at https://localhost:4000`);
});
