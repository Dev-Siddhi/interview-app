console.log("server.js file loaded");
import express from "express";
import https from "https";
import fs from "fs";
import path from "path";
import { Server } from "socket.io";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const interviewFile = path.join(__dirname, "interview.json");
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

// Save interview history to JSON file
function pastInterview(interviewer, interviewee) {
  const interview = {
    id: Date.now(),
    interviewer,
    interviewee,
    time: new Date().toISOString(),
  };
  // Read existing interviews
  let interviews = [];
  if (fs.existsSync(interviewFile)) {
    const data = fs.readFileSync(interviewFile, "utf-8");
    interviews = JSON.parse(data);
  }
  // Append new interview and save
  interviews.push(interview);
  fs.writeFileSync(interviewFile, JSON.stringify(interviews, null, 2));
}

// API to fetch all interviews related to a specific user
app.get("/interviews/:username", (req, res) => {
  const username = req.params.username.trim().toLowerCase();

  if (!fs.existsSync(interviewFile)) return res.json([]);

  const data = fs.readFileSync(interviewFile, "utf-8");
  const interviews = JSON.parse(data || "[]");

  const result = interviews.filter((i) => {

  // Filter by interviewer or interviewee name
    const interviewer = i.interviewer?.trim().toLowerCase();
    const interviewee = i.interviewee?.trim().toLowerCase();
    return interviewer === username || interviewee === username;
  });
  res.json(result);
});

// API to delete an interview by ID
app.delete("/interviews/:id", (req, res) => {
  const id = req.params.id;

  let data = fs.readFileSync(interviewFile, "utf-8");
  const interviewss = JSON.parse(data);

   // Remove the matching interview
  const updated = interviewss.filter((i) => i.id.toString() !== id.toString());

  if (interviewss.length === updated.length) {
    return res
      .status(404)
      .json({ success: false, message: "Interview not found " });
  }
  // save updated data
  fs.writeFileSync(interviewFile, JSON.stringify(updated, null, 2));
  return res.json({ success: true });
});

httpsServer.listen(4000, () => {
  console.log(`HTTPS server running at https://localhost:4000`);
});
