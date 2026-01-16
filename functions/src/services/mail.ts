
import Mailgun from 'mailgun.js';
import FormData from 'form-data';
import { defineSecret } from 'firebase-functions/params';

export const mailgunKey = defineSecret('MAILGUN_KEY');

export class MailService {
    private domain: string = 'adscentials.com'; // TODO: Replace with actual domain or config
    private sender: string = 'Adscentials <noreply@adscentials.com>'; // Placeholder

    constructor() {
        // client will be initialized in sendEmail to access the secret at runtime
    }

    private async getClient() {
        return new Mailgun(FormData).client({
            username: 'api',
            key: mailgunKey.value(),
        });
    }

    async sendEmail(to: string, subject: string, text: string, html?: string) {
        try {
            const client = await this.getClient();
            const messageData = {
                from: this.sender,
                to: to,
                subject: subject,
                text: text,
                html: html || text,
            };

            await client.messages.create(this.domain, messageData);
            console.log(`Email sent to ${to}`);
        } catch (error) {
            console.error('Error sending email:', error);
            throw error;
        }
    }

    async sendWelcomeEmail(email: string, displayName: string) {
        const subject = 'Welcome to Adscentials!';
        const text = `Hi ${displayName},\n\nWelcome to Adscentials! We're excited to have you on board.`;
        const html = `
      <h1>Welcome to Adscentials!</h1>
      <p>Hi ${displayName},</p>
      <p>Welcome to Adscentials! We're excited to have you on board.</p>
    `;
        await this.sendEmail(email, subject, text, html);
    }

    async sendNewOrderEmailToCreator(creatorEmail: string, orderDetails: any) {
        const subject = 'New Order Received!';
        const text = `You have received a new order from ${orderDetails.sponsorName}. Check your dashboard for details.`;
        const html = `
      <h1>New Order Received!</h1>
      <p>You have received a new order from <strong>${orderDetails.sponsorName}</strong>.</p>
      <p>Product: ${orderDetails.productName}</p>
      <p>Price: ${orderDetails.price}</p>
      <p><a href="https://adscentials.com/dashboard/orders">View Order</a></p>
    `;
        await this.sendEmail(creatorEmail, subject, text, html);
    }

    async sendOrderThankYouEmailToSponsor(sponsorEmail: string, orderDetails: any) {
        const subject = 'Thank you for your order on Adscentials';
        const text = `Thank you for your order with ${orderDetails.creatorName}. Your order ID is ${orderDetails.orderId}.`;
        const html = `
      <h1>Thank You for Your Order!</h1>
      <p>Thank you for your order with <strong>${orderDetails.creatorName}</strong>.</p>
      <p>Order ID: ${orderDetails.orderId}</p>
      <p>We'll notify you when the creator accepts your request.</p>
    `;
        await this.sendEmail(sponsorEmail, subject, text, html);
    }

    async sendProofOfPostEmail(sponsorEmail: string, proofDetails: any) {
        const subject = 'Proof of Post Submitted';
        const text = `The creator has submitted proof of post for your order. Check it out at: ${proofDetails.link}`;
        const html = `
      <h1>Proof of Post Submitted</h1>
      <p>The creator has submitted proof of post for your order.</p>
      <p><a href="${proofDetails.link}">View Proof</a></p>
    `;
        await this.sendEmail(sponsorEmail, subject, text, html);
    }

    async sendOrderApprovedEmail(sponsorEmail: string, orderDetails: any) {
        const subject = 'Your Order Has Been Approved!';
        const text = `Great news! ${orderDetails.creatorName} has approved your order #${orderDetails.orderId}.`;
        const html = `
      <h1>Order Approved!</h1>
      <p>Great news! <strong>${orderDetails.creatorName}</strong> has approved your order.</p>
      <p>Order ID: ${orderDetails.orderId}</p>
      <p>We will notify you when the proof of post is submitted.</p>
    `;
        await this.sendEmail(sponsorEmail, subject, text, html);
    }

    async sendOrderRejectedEmail(sponsorEmail: string, orderDetails: any) {
        const subject = 'Update on your Order';
        const text = `Unfortunately, ${orderDetails.creatorName} has declined your order #${orderDetails.orderId}. A refund has been processed.`;
        const html = `
      <h1>Order Declined</h1>
      <p>Unfortunately, <strong>${orderDetails.creatorName}</strong> has declined your order #${orderDetails.orderId}.</p>
      <p>A full refund has been initialized and will appear on your statement shortly.</p>
    `;
        await this.sendEmail(sponsorEmail, subject, text, html);
    }
}
