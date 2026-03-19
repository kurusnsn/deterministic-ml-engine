document.addEventListener('DOMContentLoaded', function () {
    const importBtn = document.getElementById('importBtn');
    const statusDiv = document.getElementById('status');

    importBtn.addEventListener('click', async () => {
        statusDiv.textContent = 'Detecting game...';
        statusDiv.className = 'status';

        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

            if (!tab || !tab.url) {
                throw new Error('No active tab found');
            }

            const url = tab.url;
            let gameId = '';
            let provider = '';

            if (url.includes('lichess.org')) {
                // Extract Lichess ID (e.g., https://lichess.org/e7exgoHwtzzh)
                // ID is usually 8 or 12 chars
                const match = url.match(/lichess\.org\/([a-zA-Z0-9]{8,12})/);
                if (match) {
                    gameId = match[1];
                    provider = 'lichess';
                }
            } else if (url.includes('chess.com')) {
                // Extract Chess.com ID (e.g., https://www.chess.com/game/live/1234567890)
                // or https://www.chess.com/analysis/game/live/1234567890
                if (url.includes('/game/')) {
                    provider = 'chesscom';
                }
            }

            if (!provider) {
                throw new Error('Not a supported game URL');
            }

            // Open local app with URL parameter - it will fetch, store, and redirect to game-review
            const localAppUrl = `http://localhost:3009/game-review?url=${encodeURIComponent(url)}`;
            chrome.tabs.create({ url: localAppUrl });

            window.close();

        } catch (err) {
            statusDiv.textContent = err.message;
            statusDiv.className = 'status error';
        }
    });
});
