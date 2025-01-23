import React from 'react';
import ReactDOM from 'react-dom';
import { App } from './App';
import reportWebVitals from './reportWebVitals';
import { BrowserRouter as Router } from 'react-router-dom';

// Global link click handler
const handleGlobalLinkClick = (event: MouseEvent) => {
    const target = event.target as HTMLElement;

    if (target.tagName === 'A' && target instanceof HTMLAnchorElement) {
        const href = target.getAttribute('href');

        // Intercept only internal links
        if (href && href.startsWith('/')) {
            event.preventDefault(); // Prevent default navigation
            window.history.pushState({}, '', href); // Update the URL
            window.dispatchEvent(new PopStateEvent('popstate')); // Notify React Router
        }
    }
};

// Attach the listener to handle all clicks globally
document.addEventListener('click', handleGlobalLinkClick);

ReactDOM.render(
    <React.StrictMode>
        <Router>
            <App />
        </Router>
    </React.StrictMode>,
    document.getElementById('root'),
);


// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals();