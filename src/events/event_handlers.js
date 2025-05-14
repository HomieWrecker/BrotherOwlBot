/**
 * Handle the signup event subcommand
 * @param {CommandInteraction} interaction - Discord interaction
 * @param {Client} client - Discord client
 */
async function handleSignupEvent(interaction, client) {
  const eventId = interaction.options.getString('event_id');
  
  // Get the event
  const event = eventService.getEvent(interaction.guildId, eventId);
  
  // Check if event exists
  if (!event) {
    await interaction.reply({
      content: '❌ Event not found',
      ephemeral: true
    });
    return;
  }
  
  // Check if event is in the past
  if (new Date(event.date) < new Date()) {
    await interaction.reply({
      content: '❌ Cannot sign up for past events',
      ephemeral: true
    });
    return;
  }
  
  // Check if the user is already a participant
  const isParticipant = event.participants && 
    event.participants.some(p => p.id === interaction.user.id);
  
  if (isParticipant) {
    await interaction.reply({
      content: '❌ You are already signed up for this event',
      ephemeral: true
    });
    return;
  }
  
  // Check if the event is at capacity
  const isFull = event.maxParticipants > 0 && 
    event.participants && 
    event.participants.length >= event.maxParticipants;
  
  if (isFull) {
    await interaction.reply({
      content: '❌ This event is at capacity',
      ephemeral: true
    });
    return;
  }
  
  // Add the user to the participants list
  const success = eventService.addParticipant(
    interaction.guildId,
    eventId,
    interaction.user.id,
    interaction.user.username
  );
  
  if (success) {
    // Get the updated event
    const updatedEvent = eventService.getEvent(interaction.guildId, eventId);
    
    // Create embed to show the event
    const embed = createEventEmbed(updatedEvent);
    
    // Check if the user is the creator of the event
    const isCreator = updatedEvent.creatorId === interaction.user.id;
    
    // Create action buttons based on user's relation to the event
    const rows = createEventActionRows(eventId, isCreator, true, false);
    
    await interaction.reply({
      content: `✅ You have successfully signed up for the event: **${updatedEvent.name}**`,
      embeds: [embed],
      components: rows
    });
  } else {
    await interaction.reply({
      content: '❌ There was an error signing up for the event',
      ephemeral: true
    });
  }
}

/**
 * Handle the withdraw event subcommand
 * @param {CommandInteraction} interaction - Discord interaction
 * @param {Client} client - Discord client
 */
async function handleWithdrawEvent(interaction, client) {
  const eventId = interaction.options.getString('event_id');
  
  // Get the event
  const event = eventService.getEvent(interaction.guildId, eventId);
  
  // Check if event exists
  if (!event) {
    await interaction.reply({
      content: '❌ Event not found',
      ephemeral: true
    });
    return;
  }
  
  // Check if event is in the past
  if (new Date(event.date) < new Date()) {
    await interaction.reply({
      content: '❌ Cannot withdraw from past events',
      ephemeral: true
    });
    return;
  }
  
  // Check if the user is a participant
  const isParticipant = event.participants && 
    event.participants.some(p => p.id === interaction.user.id);
  
  if (!isParticipant) {
    await interaction.reply({
      content: '❌ You are not signed up for this event',
      ephemeral: true
    });
    return;
  }
  
  // Remove the user from the participants list
  const success = eventService.removeParticipant(
    interaction.guildId,
    eventId,
    interaction.user.id
  );
  
  if (success) {
    // Get the updated event
    const updatedEvent = eventService.getEvent(interaction.guildId, eventId);
    
    // Create embed to show the event
    const embed = createEventEmbed(updatedEvent);
    
    // Check if the user is the creator of the event
    const isCreator = updatedEvent.creatorId === interaction.user.id;
    
    // Create action buttons based on user's relation to the event
    const rows = createEventActionRows(eventId, isCreator, false, false);
    
    await interaction.reply({
      content: `✅ You have successfully withdrawn from the event: **${updatedEvent.name}**`,
      embeds: [embed],
      components: rows
    });
  } else {
    await interaction.reply({
      content: '❌ There was an error withdrawing from the event',
      ephemeral: true
    });
  }
}