const { createCanvas, loadImage } = require('canvas');
const { AttachmentBuilder } = require('discord.js');
const TerminalEmbed = require('../../utils/embedBuilder');
const database = require('../../database');

const PURPLE = '#5C3391';
const YELLOW = '#FFD700';
const SPACING = {
    BETWEEN_GAMES: 240,
    GAME_HEIGHT: 200,
    MARGIN: 20
};

const createNominationGraphic = {
    name: 'createnomgraphic',
    description: 'Create a graphic with random nominations',

    async execute(message, args, { mobyAPI }) {
        try {
            // Check admin permissions
            const hasPermission = message.member && (
                message.member.permissions.has('Administrator') ||
                message.member.roles.cache.has(process.env.ADMIN_ROLE_ID)
            );

            if (!hasPermission) {
                await message.channel.send('```ansi\n\x1b[32m[ERROR] Insufficient permissions\n[Ready for input]█\x1b[0m```');
                return;
            }

            const month = new Date().toLocaleString('en-US', { month: 'long' }).toUpperCase();
            const nominations = await database.getNominations();
            if (!nominations.length) {
                await message.channel.send('```ansi\n\x1b[32m[ERROR] No nominations found\n[Ready for input]█\x1b[0m```');
                return;
            }

            const count = args[0] ? parseInt(args[0]) : 10;
            const selectedNoms = this.getRandomNominations(nominations, count);
            const processedGames = [];

            const progressEmbed = new TerminalEmbed()
                .setTerminalTitle('GENERATING NOMINATION GRAPHIC')
                .setTerminalDescription('[PROCESS INITIATED]')
                .addTerminalField('STATUS', 'Processing nominations...')
                .setTerminalFooter();
            
            const progressMsg = await message.channel.send({ embeds: [progressEmbed] });

            try {
                for (const nom of selectedNoms) {
                    const gameData = await this.searchGame(message, nom, mobyAPI);
                    if (gameData) {
                        processedGames.push({
                            ...gameData,
                            platform: nom.platform
                        });
                    }
                }

                if (processedGames.length > 0) {
                    const attachment = await this.generateGraphic(processedGames, progressMsg, month);
                    await message.channel.send({ files: [attachment] });
                } else {
                    await message.channel.send('```ansi\n\x1b[32m[ERROR] No valid games could be processed\n[Ready for input]█\x1b[0m```');
                }
            } finally {
                await progressMsg.delete().catch(console.error);
            }

        } catch (error) {
            console.error('Create Nomination Graphic Error:', error);
            await message.channel.send('```ansi\n\x1b[32m[ERROR] Failed to generate nomination graphic\n[Ready for input]█\x1b[0m```');
        }
    },

    async searchGame(message, nom, mobyAPI) {
        try {
            // Try exact title match first
            let searchResult = await mobyAPI.searchGames(nom.game);
            
            // If no results, try with common variations
            if (!searchResult?.games?.length) {
                const variations = [
                    nom.game.replace(/[^\w\s-]/g, ''), // Remove special characters
                    nom.game.replace(/\s+/g, ' '), // Normalize spaces
                    nom.game.replace(/(\d)(st|nd|rd|th)/g, '$1'), // Remove ordinals
                    nom.game.toLowerCase().replace(/pokemon/g, 'pokémon'), // Handle Pokemon
                    nom.game.replace(/&/g, 'and') // Replace & with 'and'
                ];

                for (const variation of variations) {
                    if (variation !== nom.game) {
                        searchResult = await mobyAPI.searchGames(variation);
                        if (searchResult?.games?.length) break;
                    }
                }
            }

            // If we have results, process them
            if (searchResult?.games?.length) {
                if (searchResult.games.length === 1) {
                    return this.formatGameData(searchResult.games[0]);
                } else {
                    // Filter results to better match the nomination
                    const bestMatch = searchResult.games.find(game => 
                        game.title.toLowerCase() === nom.game.toLowerCase() ||
                        game.platforms?.some(p => 
                            p.platform_name.toLowerCase().includes(nom.platform.toLowerCase())
                        )
                    ) || searchResult.games[0];

                    return this.formatGameData(bestMatch);
                }
            }

            // Only prompt for manual input if no matches found
            return await this.handleManualInput(message, nom);

        } catch (error) {
            console.error('Error searching game:', error);
            return await this.handleManualInput(message, nom);
        }
    },

    async handleManualInput(message, nom) {
        await message.channel.send(
            '```ansi\n\x1b[32mNo match found for: ' + nom.game + '\n\n' +
            'Please provide game details in this format:\n' +
            'Description | Genre | Metacritic Score\n\n' +
            'Example: A classic RPG with turn-based combat | RPG | 85\n\n' +
            'You have 60 seconds to respond.\n' +
            'Type "skip" to skip this game.\n' +
            '[Ready for input]█\x1b[0m```'
        );

        const filter = m => m.author.id === message.author.id;
        const collected = await message.channel.awaitMessages({
            filter,
            max: 1,
            time: 60000
        });

        if (!collected.size || collected.first().content.toLowerCase() === 'skip') {
            return null;
        }

        const [description, genre, score] = collected.first().content.split('|').map(s => s.trim());
        
        return {
            title: nom.game,
            description: description || 'No description available.',
            genre: genre || 'Unknown Genre',
            mobyScore: score || '??'
        };
    },

    formatGameData(game) {
        return {
            title: game.title,
            description: this.sanitizeDescription(game.description) || 'No description available.',
            genre: game.genres?.[0]?.genre_name || 'Unknown Genre',
            mobyScore: game.moby_score ? Math.round(game.moby_score * 10) : '??',
            sample_cover: game.sample_cover
        };
    },

    sanitizeDescription(text) {
        if (!text) return '';
        // Remove HTML tags
        text = text.replace(/<[^>]*>/g, '');
        // Remove multiple spaces
        text = text.replace(/\s+/g, ' ');
        // Remove special characters but keep basic punctuation
        text = text.replace(/[^\w\s.,!?-]/g, '');
        // Truncate to 300 characters if longer
        if (text.length > 300) {
            text = text.substring(0, 297) + '...';
        }
        return text.trim();
    },

    getRandomNominations(nominations, count) {
        const shuffled = [...nominations].sort(() => 0.5 - Math.random());
        return shuffled.slice(0, Math.min(count, nominations.length));
    },

    async generateGraphic(games, progressMsg, month) {
        const canvas = createCanvas(900, 1200);
        const ctx = canvas.getContext('2d');

        // Background
        ctx.fillStyle = '#2C2C2C';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Header with dark background
        ctx.fillStyle = '#1A1A1A';
        ctx.fillRect(0, 0, canvas.width, 100);
        
        // Draw header text with proper spacing
        ctx.font = 'bold 48px Arial';
        const headerParts = [
            { text: month, color: '#FFFFFF', x: 20 },
            { text: 'RETRO CHALLENGE', color: '#FFFFFF', x: 220 },
            { text: 'NOMINEES', color: PURPLE, x: 650 }
        ];
        
        headerParts.forEach(part => {
            ctx.fillStyle = part.color;
            ctx.fillText(part.text, part.x, 60);
        });

        let yOffset = 120;

        for (const [index, game] of games.entries()) {
            try {
                await progressMsg.edit({
                    embeds: [new TerminalEmbed()
                        .setTerminalTitle('GENERATING NOMINATION GRAPHIC')
                        .setTerminalDescription('[PROCESS RUNNING]')
                        .addTerminalField('STATUS', `Processing game ${index + 1}/${games.length}: ${game.title}`)
                        .setTerminalFooter()]
                });

                const isYellow = index % 2 === 1;

                // Draw section background
                ctx.fillStyle = isYellow ? YELLOW : PURPLE;
                ctx.fillRect(0, yOffset, canvas.width, SPACING.GAME_HEIGHT);

                // Try to load and draw box art
                let boxArtWidth = 150; // default width
                let boxArtHeight = 180; // default height
                let boxArtX = isYellow ? 20 : canvas.width - 170;
                
                if (game.sample_cover?.image) {
                    try {
                        const boxArt = await loadImage(game.sample_cover.image);
                        
                        // Calculate aspect ratio and new dimensions
                        const aspectRatio = boxArt.width / boxArt.height;
                        if (aspectRatio > 1) {
                            // Wider than tall
                            boxArtWidth = 150;
                            boxArtHeight = 150 / aspectRatio;
                        } else {
                            // Taller than wide
                            boxArtHeight = 180;
                            boxArtWidth = 180 * aspectRatio;
                        }

                        // Center the box art vertically in the space
                        const verticalOffset = (180 - boxArtHeight) / 2;
                        
                        // Adjust X position for right-aligned images
                        if (!isYellow) {
                            boxArtX = canvas.width - boxArtWidth - 20;
                        }

                        ctx.drawImage(boxArt, boxArtX, yOffset + 10 + verticalOffset, boxArtWidth, boxArtHeight);
                    } catch (err) {
                        console.error('Error loading box art:', err);
                    }
                }

                // Text position adjusted based on box art
                const textX = isYellow ? boxArtX + boxArtWidth + 20 : 20;
                const textWidth = isYellow ? 
                    canvas.width - (boxArtX + boxArtWidth + 40) : // 20px padding on each side
                    canvas.width - (boxArtWidth + 60); // Account for right-aligned box art

                // Title
                ctx.font = 'bold 36px Arial';
                ctx.fillStyle = isYellow ? PURPLE : '#FFFFFF';
                ctx.fillText(game.title, textX, yOffset + 45);
                
                // Platform and Score
                ctx.font = 'bold 24px Arial';
                ctx.fillStyle = isYellow ? '#000000' : '#FFFFFF';
                ctx.fillText(`${game.platform} (Metacritic: ${game.mobyScore})`, textX, yOffset + 80);

                // Genre
                ctx.fillText(game.genre, textX, yOffset + 110);

                // Description
                ctx.font = '16px Arial';
                const wrappedDesc = this.wrapText(ctx, game.description, textWidth);
                let textY = yOffset + 140;
                wrappedDesc.forEach(line => {
                    ctx.fillText(line, textX, textY);
                    textY += 20;
                });

                yOffset += SPACING.BETWEEN_GAMES;
            } catch (error) {
                console.error(`Error processing game ${game.title}:`, error);
                continue;
            }
        }

        const buffer = canvas.toBuffer('image/png');
        return new AttachmentBuilder(buffer, { name: 'nominations.png' });
    },

    wrapText(ctx, text, maxWidth) {
        const words = text.split(' ');
        const lines = [];
        let currentLine = words[0];

        for (let i = 1; i < words.length; i++) {
            const word = words[i];
            const width = ctx.measureText(currentLine + " " + word).width;
            if (width < maxWidth) {
                currentLine += " " + word;
            } else {
                lines.push(currentLine);
                currentLine = word;
            }
        }
        lines.push(currentLine);
        return lines;
    }
};

module.exports = createNominationGraphic;
