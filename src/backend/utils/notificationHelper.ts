import pool from '../config/db';

// STAFF ONLY. `notifications` is an employee inbox, not a general one:
//   - notifications.user_id has an FK to employees(id)
//   - GET /api/notifications INNER JOINs employees, so a row for anyone else
//     would be invisible even if it could be inserted
//   - only /admin/csr and /admin/cleaners read it
//
// Passing a GUEST's users.user_id here therefore raises a foreign-key violation
// every time. That is exactly how the date-change decision notice went missing
// for months: the call sat in a try/catch that logged and moved on, so the
// booking changed and the guest was never told.
//
// Guest-facing messages go out by EMAIL (see backend/utils/dispatchEmail.ts and
// the /api/send-*-email routes). If a guest-visible inbox is ever wanted, it
// needs its own table and its own UI — do not widen this one.


export interface NotificationData {
  userId: string;
  title: string;
  message: string;
  notificationType: string;
}

/**
 * Create notifications for users with specific roles
 */
export async function createNotificationsForRoles(
  roles: string[],
  notificationData: Omit<NotificationData, 'userId'>
): Promise<void> {
  const client = await pool.connect();
  
  try {
    // Get all employees with specified roles
    const employeesQuery = `
      SELECT id, first_name, last_name, email, role
      FROM employees
      WHERE role = ANY($1)
    `;
    
    const employeesResult = await client.query(employeesQuery, [roles]);
    const employees = employeesResult.rows;
    
    // Insert notifications for all matching employees
    if (employees.length > 0) {
      for (const employee of employees) {
        try {
          const notificationQuery = `
            INSERT INTO notifications (user_id, title, message, notification_type, is_read)
            VALUES ($1, $2, $3, $4, $5)
            RETURNING notification_id
          `;
          
          await client.query(notificationQuery, [
            employee.id,
            notificationData.title,
            notificationData.message,
            notificationData.notificationType,
            false
          ]);
          
          console.log(`✅ Notification created for ${employee.role} ${employee.first_name} ${employee.last_name}`);
        } catch (notificationError) {
          console.error(`Failed to create notification for employee ${employee.id}:`, notificationError);
          // Continue with other employees even if one fails
        }
      }
    }
  } catch (error) {
    console.error('Error creating notifications for roles:', error);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Create a notification for one EMPLOYEE.
 *
 * `employeeId` must be an employees.id — a guest's users.user_id will raise a
 * foreign-key violation (see the note at the top of this file). Callers should
 * let that throw rather than swallowing it, or the message is lost in silence.
 */
export async function createNotificationForUser(
  userId: string,
  notificationData: Omit<NotificationData, 'userId'>
): Promise<void> {
  const client = await pool.connect();
  
  try {
    const notificationQuery = `
      INSERT INTO notifications (user_id, title, message, notification_type, is_read)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING notification_id
    `;
    
    await client.query(notificationQuery, [
      userId,
      notificationData.title,
      notificationData.message,
      notificationData.notificationType,
      false
    ]);
    
    console.log(`✅ Notification created for user ${userId}`);
  } catch (error) {
    console.error('Error creating notification for user:', error);
    throw error;
  } finally {
    client.release();
  }
}
