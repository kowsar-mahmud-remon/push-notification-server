const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const { Expo } = require('expo-server-sdk');

const app = express();
const expo = new Expo();

app.use(cors());
app.use(bodyParser.json());

// In-memory storage for push tokens (replace with database in production)
const pushTokens = {};

// Endpoint to save push tokens
app.post('/api/save-push-token', (req, res) => {
  const { token, userId } = req.body;

  if (!token || !userId) {
    return res.status(400).json({ error: 'Token and userId are required' });
  }

  pushTokens[userId] = token;
  console.log(`Saved push token for user ${userId}`);
  res.json({ success: true });
});

// Endpoint to send notifications
// app.post('/api/send-notification', async (req, res) => {
//   const { recipientId, title, body, data } = req.body;

//   if (!recipientId || !title || !body) {
//     return res.status(400).json({ error: 'recipientId, title and body are required' });
//   }

//   const pushToken = pushTokens[recipientId];

//   if (!pushToken) {
//     return res.status(404).json({ error: 'Recipient push token not found' });
//   }

//   if (!Expo.isExpoPushToken(pushToken)) {
//     return res.status(400).json({ error: 'Invalid Expo push token' });
//   }

//   const messages = [{
//     to: pushToken,
//     sound: 'default',
//     title,
//     body,
//     data,
//   }];

//   try {
//     const chunks = expo.chunkPushNotifications(messages);
//     const tickets = [];

//     for (const chunk of chunks) {
//       try {
//         const ticketChunk = await expo.sendPushNotificationsAsync(chunk);
//         tickets.push(...ticketChunk);
//       } catch (error) {
//         console.error('Error sending chunk:', error);
//       }
//     }

//     res.json({ success: true, tickets });
//   } catch (error) {
//     console.error('Error sending notifications:', error);
//     res.status(500).json({ error: 'Failed to send notifications' });
//   }
// });

// Add this helper function (pseudocode - adapt to your DB)
async function getAllDietitianTokens() {
  // In a real app, you would query your database here
  // This example assumes you're using the in-memory storage
  return Object.entries(pushTokens)
    .filter(([userId]) => userId.startsWith('dietitian-')) // Or some dietitian identifier
    .map(([_, token]) => token);
}


// Then modify your send-notification endpoint
app.post('/api/send-notification', async (req, res) => {
  const { recipientId, title, body, data } = req.body;

  console.log('Received notification request:', { recipientId, title, body }); // Debug log

  if (!recipientId || !title || !body) {
    return res.status(400).json({ error: 'recipientId, title and body are required' });
  }

  try {
    let tokens = [];

    // Special case for notifying all dietitians
    if (recipientId === 'all-dietitians') {
      tokens = await getAllDietitianTokens();
      console.log(`Sending to all dietitians, found ${tokens.length} tokens`);
    }
    // Special case for notifying a single dietitian
    else if (recipientId.startsWith('dietitian-')) {
      const token = pushTokens[recipientId];
      if (token) tokens.push(token);
    }
    // Normal user case
    else {
      const token = pushTokens[recipientId];
      if (token) tokens.push(token);
    }

    if (tokens.length === 0) {
      console.error('No valid tokens found for recipient:', recipientId);
      return res.status(404).json({ error: 'No valid recipients found' });
    }

    // Filter valid Expo tokens
    const validTokens = tokens.filter(token => Expo.isExpoPushToken(token));
    console.log(`Sending to ${validTokens.length} valid tokens`);

    const messages = validTokens.map(token => ({
      to: token,
      sound: 'default',
      title,
      body,
      data,
    }));

    // Send in chunks
    const chunks = expo.chunkPushNotifications(messages);
    let tickets = [];

    for (const chunk of chunks) {
      try {
        const ticketChunk = await expo.sendPushNotificationsAsync(chunk);
        tickets = tickets.concat(ticketChunk);
        console.log('Sent chunk successfully');
      } catch (error) {
        console.error('Error sending chunk:', error);
      }
    }

    res.json({
      success: true,
      tickets,
      message: `Notification sent to ${validTokens.length} device(s)`
    });
  } catch (error) {
    console.error('Error in notification endpoint:', error);
    res.status(500).json({ error: 'Failed to send notifications' });
  }
});

app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Chat App Server</title>
      <style>
        body {
          font-family: Arial, sans-serif;
          text-align: center;
          margin: 0;
          padding: 2rem;
          background-color: #f5f5f5;
        }
        .container {
          max-width: 800px;
          margin: 0 auto;
          background: white;
          padding: 2rem;
          border-radius: 8px;
          box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        }
        h1 {
          color: #2c3e50;
        }
        .status {
          color: #27ae60;
          font-weight: bold;
          margin: 1.5rem 0;
          font-size: 1.2rem;
        }
        .endpoints {
          text-align: left;
          margin: 2rem auto;
          max-width: 600px;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>Chat Notification Server</h1>
        <div class="status">✅ Server is running properly</div>
        <p>This server handles push notifications between users and dietitians.</p>
        
        <div class="endpoints">
          <h3>Available Endpoints:</h3>
          <ul>
            <li><strong>POST</strong> /api/register/{user|dietitian}/{id}</li>
            <li><strong>POST</strong> /api/notify-user/{userId}</li>
            <li><strong>POST</strong> /api/notify-dietitian/{dietitianId}</li>
          </ul>
        </div>
        
        <p>Deployed on Vercel at: ${process.env.VERCEL_URL || 'http://localhost:3000'}</p>
      </div>
    </body>
    </html>
  `);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});