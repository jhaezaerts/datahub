import React, { useState, useEffect, useRef } from 'react';
import sendIcon from './images/send_icon.png';
import hda_logo from './images/hda_logo.png';
import chatbot_icon from './images/chatbot_icon.png';
import "./Chatbot.css"; // Import your chatbot-specific CSS


const CHATBOT_API_URL = "http://localhost:9003";
const FRONTEND_API_TOKEN = "dh_cb_pk_5f9a4b2c8e3d7f6159284a0c1b3d9e7f"

// Helper function to generate a UUID
const generateUUID = (): string => {
  let dt = new Date().getTime();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (dt + Math.random() * 16) % 16 | 0;
    dt = Math.floor(dt / 16);
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
};

// Chatbot component
const Chatbot: React.FC = () => {
  const [conversationId] = useState(generateUUID());
  const [messages, setMessages] = useState<any[]>([]);
  const [isChatVisible, setChatVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const chatMessagesRef = useRef<HTMLDivElement>(null);

  // Toggle chat visibility
  const toggleChat = () => setChatVisible(!isChatVisible);

  // Handle feedback on AI responses
  const handleFeedback = async (value: number, traceId: string, messageId: string) => {
    try {
      // Send feedback to the backend
      const response = await fetch(`${CHATBOT_API_URL}/api/feedback`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': FRONTEND_API_TOKEN,
        },
        body: JSON.stringify({
          traceId: traceId,
          value: value,
          name: "user_feedback",
          data_type: "BOOLEAN",
          comment: value === 1 ? 'User found response helpful' : 'User found response unhelpful'
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        console.error('Feedback error:', errorData);
        throw new Error(`Failed to send feedback: ${JSON.stringify(errorData)}`);
      }
  
      // Update the local state to reflect the feedback
      setMessages((prevMessages) =>
        prevMessages.map((msg) =>
          msg.id === messageId
            ? { ...msg, feedbackGiven: true, feedback: value === 1 ? '👍' : '👎' }
            : msg
        )
      );
    } catch (error) {
      console.error('Error sending feedback:', error);
    }
  };

  // Send a message to the chatbot
  const sendMessage = async (inputValue: string) => {
    if (!inputValue.trim()) return;

    const newMessage = { id: generateUUID(), content: inputValue, isUser: true };
    setMessages((prevMessages) => [...prevMessages, newMessage]);

    const inputField = document.getElementById('chat-input') as HTMLInputElement;
    inputField.value = '';

    setLoading(true);

    try {
      const response = await fetch(`${CHATBOT_API_URL}/api/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': FRONTEND_API_TOKEN,
        },
        body: JSON.stringify({ input_value: inputValue, session_id: conversationId }),
      });

      const data = await response.json();
      const aiResponse = data.outputs?.[0]?.outputs?.[0]?.results?.message?.text || 'Sorry, something went wrong. Please try again.';

      const messageId = generateUUID();
      setMessages((prevMessages) => [
        ...prevMessages,
        {
          id: messageId,
          content: aiResponse,
          isUser: false,
          feedbackGiven: false,
          traceId: data.traceId,
        },
      ]);
    } catch (error) {
      console.error('Error:', error);
      setMessages((prevMessages) => [
        ...prevMessages,
        { id: generateUUID(), content: 'Sorry, something went wrong. Please try again.', isUser: false },
      ]);
    } finally {
      setLoading(false);
    }
  };

  // Scroll to bottom of chat
  useEffect(() => {
    if (chatMessagesRef.current) {
      chatMessagesRef.current.scrollTop = chatMessagesRef.current.scrollHeight;
    }
  }, [messages]);

  return (
    <div className="chat-widget">

        
        {/* Chat container */}
        <div id="chat-container" className={`chat-container ${isChatVisible ? '' : 'hidden'}`}>
            {/* Chat header */}
            <div className="chat-header">
            <div className="header-left">
                <img src={hda_logo} alt="Logo" className="header-logo" />
                <div className="header-text">
                <span className="header-title">Chat with our AI assistant</span>
                <span className="header-subtitle">Here to assist with your health data queries.</span>
                </div>
            </div>
            <button onClick={toggleChat} className="close-button">
                ×
            </button>
            </div>

        {/* Chat messages */}
        <div id="chat-messages" className="chat-messages" ref={chatMessagesRef}>
        {messages.map((message) => (
            <div key={message.id} style={{ display: 'flex', flexDirection: 'column' }}>
            <div className={`chat-message ${message.isUser ? 'sent' : 'received'}`}>
                {message.content}
            </div>
            {!message.isUser && !message.feedbackGiven && (
                <div className="feedback-buttons">
                <button
                    className="feedback-button"
                    data-tooltip="Good response"
                    onClick={() => handleFeedback(1, message.traceId, message.id)}
                >
                    👍
                </button>
                <button
                    className="feedback-button"
                    data-tooltip="Bad response"
                    onClick={() => handleFeedback(0, message.traceId, message.id)}
                >
                    👎
                </button>
                </div>
            )}
            </div>
        ))}
        </div>


        {/* Chat input */}
        <div className="chat-input-container">
          <div className="chat-input-sub-container">
            <input
              id="chat-input"
              type="text"
              placeholder="Ask a question / Stel een vraag / Posez une question"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  sendMessage(e.currentTarget.value);
                }
              }}
            />
            <button className="send-button" onClick={() => sendMessage(document.getElementById('chat-input')!.value)}>
              <img src={sendIcon} alt="Send" />
            </button>
          </div>
        </div>
      </div>

      {/* Button to toggle chat widget visibility */}
   
      <div id="chat-toggle-pill" className={`chat-toggle-pill ${isChatVisible ? 'hidden' : ''}`} onClick={toggleChat}>
        <div className="circle">
            <img src={chatbot_icon} alt="chatbot" className="chatbot-icon" />
        </div>
        </div>

      {/* Loader while waiting for a response */}
      {loading && (
        <div className="loader-message">
          <div className="loader"></div>
        </div>
      )}
    </div>
  );
};

export default Chatbot;
