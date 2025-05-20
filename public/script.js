const socket = io();
let role = "";
let username;
let editor;
let roomId = "";

{//login page

  // class to handle user data
  class User {
    constructor(username, role) {
      this.username = username.trim();
      this.role = role;
    }

    // save username and role to session store
    saveToSession() {
      sessionStorage.setItem("username", this.username);
      sessionStorage.setItem("role", this.role);

      // save user name with their role
      if (this.role === "interviewer") {
        sessionStorage.setItem("interviewerName", this.username);
      } else if (this.role === "interviewee") {
        sessionStorage.setItem("intervieweeName", this.username);
      }
    }
  }

  // class to handle login logic
  class LoginManager {
    constructor() {
      this.usernameInput = document.getElementById("usernameInput");
    }

    // get selected role from radio buttons
    getRole() {
      const isInterviewer = document.getElementById("interviewerBtn").checked;
      const isInterviewee = document.getElementById("intervieweeBtn").checked;

      if (!isInterviewer && !isInterviewee) return null;
      return isInterviewer ? "interviewer" : "interviewee";
    }

    // perform login
    login() {
      const username = this.usernameInput.value.trim();
      const role = this.getRole();

      // if username is missing send alert
      if (!username) {
        alert("Enter username");
        return;
      }

      // if role is missing send alert
      if (!role) {
        alert("Please select a role");
        return;
      }

      // save user information
      const user = new User(username, role);
      user.saveToSession();

      // display main section after login and hide login section
      document.getElementById("loginPage").style.display = "none";
      document.getElementById("pastPanel").style.display = "block";
      document.getElementById("mainPage").style.display = "block";
      document.getElementById("editorPanel").style.display = "block";

      // show block according to user role
      if (role === "interviewer") {
        socket.emit("interviewerLogin", username);
        document.getElementById("roomPageInterviewer").style.display = "block";
      } else {
        socket.emit("intervieweeLogin", username);
        document.getElementById("roomPageInterviewee").style.display = "block";
      }
      // clear input field
      this.usernameInput.value = "";
    }
  }

  // create a login manager obj
  const loginManager = new LoginManager();

  // when login button is pressed call login function
  document.getElementById("loginBtn").addEventListener("click", () => {
    loginManager.login();
  });
}

{//room page

  // function to create new room (interviewer side)
  function createRoom() {
    const interviewerName = sessionStorage.getItem("username");

    // generate a unique room id
    roomId = crypto.randomUUID();

    // save room and role info
    sessionStorage.setItem("roomId", roomId);
    sessionStorage.setItem("role", "interviewer");

    // show room id on screen
    document.getElementById("displayRoomId").innerText = `Room ID: ${roomId}`;

    // notify server to create room
    socket.emit("createRoom", { roomId, username: interviewerName });
  }

  // function to join room (interviewee side)
  function joinRoom() {
    const intervieweeName = sessionStorage.getItem("username");
    roomId = document.getElementById("room-id").value.trim();

    if (!roomId) return alert("Enter Room_ID");

    // save role and room info
    sessionStorage.setItem("roomId", roomId);
    sessionStorage.setItem("role", "interviewee");

    //notify server to join room
    socket.emit("join-Room", { roomId, username: intervieweeName });

    // show main page
    document.getElementById("mainPage").style.display = "block";

    // empty room id input field
    document.getElementById("room-id").value = "";

    // send reminder notification
    if (Notification.permission === "granted") {
      console.log("notification sent");
      new Notification("Reminder Notification", {
        body: "The interview is about to commence shortly",
      });
    } else if (Notification.permission === "denied") {
      alert("you've denied permission");
    } else {
      Notification.requestPermission();
    }
  }

  // handle room created cnf from server
  socket.on("roomCreated", ({ roomId }) => {
    console.log(`room created succefully ${roomId}`);
    document.getElementById("createRoomBtn").disabled = true;
  });

  // show message if room expired due to timeout
  socket.on("roomExpired", ({ roomId }) => {
    alert(`Room "${roomId}" expired because no interviewee joined in time.`);

    document.getElementById("roomPageInterviewer").style.display = "none";
    document.getElementById("loginPage").style.display = "block";
  });

  // confirm room joined
  socket.on("joinedRoom", ({ roomId }) => {
    console.log(`successfully joined room:${roomId}`);
  });

  // notify interviewer that interviewee has joined
  socket.on("intervieweeJoined", ({ user }) => {
    document.getElementById(
      "status"
    ).innerText = `${user} has joined the interview`;
  });

  // notify interviewee that interviewer is already in the room
  socket.on("interviewerAlreadyPresent", ({ message }) => {
    document.getElementById("statusInterviewer").innerText = message;
  });

  // show error message from server
  socket.on("error", ({ message }) => {
    alert(message);
  });

  // reload the page when user click logout button
  function logout() {
    window.location.reload();
  }
}

{//Past Interviews

  // class to manage past interviews load , display & delete
  class InterviewManager {
    constructor() {
      this.resultdiv = document.getElementById("interviewLogs");
      this.inputField = document.getElementById("pastInterviewInput");
      this.loadButton = document.getElementById("pastInterviewBtn");

      // when user clicks button show past interviews
      this.loadButton.addEventListener("click", () =>
        this.loadPastInterviews()
      );
    }

    // Load past interviews of entered username
    async loadPastInterviews() {
      // clear previous result
      this.resultdiv.innerText = "";
      const username = this.inputField.value;

      if (!username) {
        alert("Please enter a username");
        return;
      }

      try {
        // request past interviews from server
        const res = await fetch(`/interviews/${username}`);
        const interviews = await res.json();

        // If no data found, show message
        if (interviews.length === 0) {
          resultdiv.textContent = "No interviews found";
          return;
        }

        // Show each interview on screen
        interviews.forEach((interview) => this.displayInterview(interview));
      } catch (err) {
        console.error("Error fetching interviews:", err);
        alert("Failed to load past interviews");
      }
    }

    // Display each interview with a delete button
    displayInterview(interview) {
      const div = document.createElement("div");

      // Show interviewer, interviewee and time
      div.textContent = `Interviewer: ${interview.interviewer}, Interviewee: ${
        interview.interviewee
      }, Time: ${new Date(interview.time).toLocaleString()}`;

      // Create Delete button
      const deleteBtn = document.createElement("button");
      deleteBtn.innerText = "Delete";
      deleteBtn.style.marginLeft = "10px";

      // Add delete button and full interview info to page
      div.appendChild(deleteBtn);
      this.resultdiv.appendChild(div);

      // When delete button is clicked, delete this interview
      deleteBtn.addEventListener("click", () =>
        this.deleteInterview(interview.id, div)
      );
    }

    // Delete interview from server and remove it from screen
    async deleteInterview(id, divElement) {
      try {
        // Send delete request to server
        const res = await fetch(`/interviews/${id}`, {
          method: "DELETE",
        });

        const data = await res.json();

        if (data.success) {
          // Remove from screen
          divElement.remove();
        } else {
          console.log("failed to remove");
          alert("failed to remove", data.message);
        }
      } catch (err) {
        console.error("Delete error:", err);
        alert("An error occurred while deleting the interview.");
      }
    }
  }

  // Create instance of InterviewManager when page loads
  new InterviewManager();
}

{//chat messages
  // when send button is clicked
  document.getElementById("sendButton").addEventListener("click", () => {
    console.log("message send button pressed");
    const message = document.getElementById("messageInput").value;

    if (message) {
      // check role and get details
      if (sessionStorage.getItem("role") === "interviewee") {
        const username = sessionStorage.getItem("username");
        const roomId = sessionStorage.getItem("roomId");

        // send message to server
        socket.emit("chat message", {
          roomId,
          data: {
            message: message,
            sender: username,
          },
        });
        document.getElementById("messageInput").value = "";
      } else if (sessionStorage.getItem("role") === "interviewer") {
        const interviewerName = sessionStorage.getItem("interviewerName");
        const roomId = sessionStorage.getItem("roomId");

        // send message to server
        socket.emit("chat message", {
          roomId,
          data: {
            message: message,
            sender: interviewerName,
          },
        });
        // empty input box
        document.getElementById("messageInput").value = "";
      }
    }
  });
  // Display received messages on screen
  socket.on("chat message", (data) => {
    const messagediv = document.createElement("div");
    messagediv.textContent = `${data.sender}: ${data.message}`;
    document.getElementById("message").appendChild(messagediv);
  });
}

{ // video call

  // variable to hold media stream and peer connection
  let localStream;
  let remoteStream;
  let peerConnection;
  let pendingCandidates = []; // ICE candidates received before remote description set

  // Configuration for ICE servers (STUN server to get public IP)
  const configuration = {
    iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
  };

  // Get video elements and buttons from DOM
  const localVideo = document.getElementById("localVideo");
  const remoteVideo = document.getElementById("remoteVideo");
  const startCallBtn = document.getElementById("startCall");
  const endCallBtn = document.getElementById("endCall");

  // Start call button clicked
  startCallBtn.addEventListener("click", async () => {
    const currRoomId = sessionStorage.getItem("roomId");

    try {
      // Get local media stream (video + audio)
      localStream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true,
      });

      // Show local stream in local video element
      localVideo.srcObject = localStream;

      // create RTCPeerConnection
      createPeerConnection();

      // Add all tracks (audio + video) from localStream to peer connection
      localStream
        .getTracks()
        .forEach((track) => peerConnection.addTrack(track, localStream));

      // Create an  offer to start WebRTC
      const offer = await peerConnection.createOffer();
      await peerConnection.setLocalDescription(offer);

       // Send the offer to the remote peer
      socket.emit("offer", { roomId: currRoomId, offer });
    } catch (err) {
      console.error("Error accessing media devices", err);
    }
  });

  // handle receiving an offer from remote peer 
  socket.on("offer", async ({ roomId, offer }) => {
    const currRoomId = sessionStorage.getItem("roomId");

    try {
      if (!localStream) {
        // If local stream not ready, get media devices
        localStream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: true,
        });
        localVideo.srcObject = localStream;
      }

      // If peer connection not created yet, create it and add local tracks
      if (!peerConnection) {
        createPeerConnection();
        localStream
          .getTracks()
          .forEach((track) => peerConnection.addTrack(track, localStream));
      }

       // Set the received offer as remote description
      await peerConnection.setRemoteDescription(
        new RTCSessionDescription(offer)
      );

      // Create an answer in response to the offer
      const answer = await peerConnection.createAnswer();
      await peerConnection.setLocalDescription(answer);

      // Send the answer back to remote pee
      socket.emit("answer", { roomId: currRoomId, answer });

      // Add any ICE candidates received earlier before remote description was set
      for (const candidate of pendingCandidates) {
        await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
      }
      pendingCandidates = [];
    } catch (err) {
      console.error("Error handling offer", err);
    }
  });

  // Handle receiving an answer to your offer
  socket.on("answer", async ({ roomId, answer }) => {
    try {
       // Set the received answer as remote description
      if (!peerConnection) return;
      await peerConnection.setRemoteDescription(
        new RTCSessionDescription(answer)
      );

      // Add any ICE candidates that arrived earlier
      for (const candidate of pendingCandidates) {
        await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
      }
      pendingCandidates = [];
    } catch (err) {
      console.error("Error handling answer", err);
    }
  });
  
// Handle receiving ICE candidates from remote peer
  socket.on("ice-candidate", async ({ roomId, candidate }) => {
    try {
      if (!peerConnection || !candidate) return;

      // If remote description not set yet, queue candidates for later
      if (
        !peerConnection.remoteDescription ||
        !peerConnection.remoteDescription.type
      ) {
        pendingCandidates.push(candidate);

      } else {
         // add candidate immediately
        await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
      }
    } catch (err) {
      console.error("Error adding ICE candidate", err);
    }
  });

  // Handle call ended event from remote peer
  socket.on("call-ended", () => {
    endingCall();
  });

// Create RTCPeerConnection 
  function createPeerConnection() {
    const currRoomId = sessionStorage.getItem("roomId");
    peerConnection = new RTCPeerConnection(configuration);

    // When new ICE candidate is found, send it to remote peer
    peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        socket.emit("ice-candidate", {
          roomId: currRoomId,
          candidate: event.candidate,
        });
      }
    };

    // When remote track (audio/video) arrives, set it to remoteVideo element
    peerConnection.ontrack = (event) => {
      if (event.streams.length > 0) {
        remoteStream = event.streams[0];
        remoteVideo.srcObject = remoteStream;
      } else {
        console.log("not receiving any remote streams");
      }
    };
  }

  // function ending call
  function endingCall() {
    if (peerConnection) {
      peerConnection.close();
      peerConnection = null;
    }
    if (localStream) {
      localStream.getTracks().forEach((track) => track.stop());
      localVideo.srcObject = null;
    }
    if (remoteVideo.srcObject instanceof MediaStream) {
      remoteVideo.srcObject.getTracks().forEach((track) => track.stop());
      remoteVideo.srcObject = null;
    }
    pendingCandidates = [];
  }

  // End call button clicked
  endCallBtn.addEventListener("click", () => {
    endingCall();
    // notify remote peer that call has ended
    socket.emit("call-ended", roomId);
  });
}

{ //Monaco Editor

  let flag = false;

  // Load Monaco editor scripts from CDN
  require.config({
    paths: { vs: "https://unpkg.com/monaco-editor@latest/min/vs" },
  });

  require(["vs/editor/editor.main"], function () {
    editor = monaco.editor.create(document.getElementById("editor-container"), {
      value: "//Type your code here...",
      language: "javascript",
      theme: "vs-white",
      automaticLayout: true,
    });

    // detect local typing and emit changed
    editor.onDidChangeModelContent(() => {
      if (flag) {
        flag = false; //avoids an infinite loop of updates between users.
        return;
      }
      const code = editor.getValue();
      const roomId = sessionStorage.getItem("roomId");
      // send code to others in the room
      socket.emit("code-change", { roomId, code });
    });

    // when code is updated by remote user
    socket.on("code-update", (code) => {
      if (editor && editor.getValue() !== code) {
        const position = editor.getPosition(); //remember cursor's position
        flag = true; //prevent re-triggering local change event
        editor.setValue(code); //update editor with new code
        editor.setPosition(position); //restore cursor position
      }
    });
  });

  // when user clicks on copy button
  document.getElementById("copyBtn").addEventListener("click", () => {
    if (editor) {
      const code = editor.getValue(); //get current code
      navigator.clipboard
        .writeText(code) //copy it to clipboard
        .then(() => {
          alert("Code copied to clipboard!");
        })
        .catch((err) => {
          console.error("Failed to copy: ", err);
          alert("Failed to copy code.");
        });
    }
  });
}
