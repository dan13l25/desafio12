import userRepository from "../repositories/userRepositorie.js";
import bcrypt from "bcrypt";
import { generateToken } from "../../config/jwtConfig.js";
import { createHash, isValidPassword } from "../../utils.js";
import { ADMIN_EMAIL, ADMIN_PASSWORD,EMAIL_USERNAME } from "../../utils.js";
import UserDTO from "../dto/UserDTO.js";
import { devLogger as logger } from "../../utils/loggers.js";
import crypto from "crypto"
import { transporter } from "../../config/mailer.js";
import userModel from "../models/users.js";

const userService = {
    login: async (email, password) => {
        try {
            const user = await userRepository.findByEmail(email);

            if (!user) {
                throw new Error("Credenciales inválidas");
            }

            const validPassword = isValidPassword(user, password);

            if (!validPassword) {
                throw new Error("Credenciales inválidas");
            }

            if (email === ADMIN_EMAIL && password === ADMIN_PASSWORD) {
                user.role = "admin";
            }

            const access_token = generateToken(user);

            return { user, access_token };
        } catch (error) {
            logger.error("Error al iniciar sesión:", error.message);
            throw error;
        }
    },

    getRegister: async () => {
        try {
            return "register";
        } catch (error) {
            logger.error("Error al obtener la vista de registro:", error.message);
            throw error;
        }
    },

    register: async (userData) => {
        try {
            const { first_name, last_name, email, age, password } = userData;

            const existingUser = await userRepository.findByEmail(email);

            if (existingUser) {
                throw new Error("El usuario ya existe");
            }

            const hashedPassword = await bcrypt.hash(password, 10);
            const userDTO = new UserDTO(first_name, last_name, email, age, hashedPassword);

            const newUser = await userRepository.createUser(userDTO);

            const access_token = generateToken(newUser);

            return { newUser, access_token };
        } catch (error) {
            logger.error("Error al registrar usuario:", error.message);
            throw error;
        }
    },

    restorePassword: async (email, password) => {
        try {
            const user = await userRepository.findByEmail(email);

            if (!user) {
                throw new Error("Usuario no encontrado");
            }

            const newPass = createHash(password);

            await userModel.updateOne({ _id: user._id }, { $set: { password: newPass } });

            return "Password actualizado";
        } catch (error) {
            logger.error("Error al restaurar la contraseña:", error.message);
            throw error;
        }
    },

    logOut: async (req, res) => {
        try {
            res.clearCookie("jwtToken");
            
            req.session.destroy((err) => {
                if (err) {
                    logger.error("Error al cerrar sesión:", err.message);
                    return res.status(500).json({ error: "Error interno del servidor" });
                }
                
                res.redirect("/login");
            });
        } catch (error) {
            logger.error("Error al cerrar sesión:", error.message);
            res.status(500).json({ error: "Error interno del servidor" });
        }
    },

    requestPasswordReset: async (email) => {
        try {
            const user = await userRepository.findByEmail(email);
            if (!user) {
                throw new Error("Usuario no encontrado");
            }

            const token = crypto.randomBytes(20).toString('hex');
            const expirationDate = Date.now() + 3600000; 

            user.resetPasswordToken = token;
            user.resetPasswordExpires = expirationDate;
            await user.save();

            const resetLink = `http://localhost:8080/api/users/reset-password/${token}`;

            const mailOptions = {
                to: user.email,
                from: EMAIL_USERNAME,
                subject: 'Restablecer contraseña',
                text: `Recibiste este correo porque tú (o alguien mas) solicito el restablecer la contraseña de tu cuenta.\n\n
                Por favor, haz clic en el siguiente enlace, o pégalo en tu navegador para completar el proceso:\n\n
                ${resetLink}\n\n
                Si no has solicitado esto, por favor ignora este correo y tu contraseña permanecerá sin cambios.\n`
            };

            await transporter.sendMail(mailOptions);

            return "Correo de restablecimiento enviado";
        } catch (error) {
            logger.error("Error al solicitar restablecimiento de contraseña:", error.message);
            throw error;
        }
    },

    resetPassword: async (token, newPassword) => {
        try {
            const user = await userModel.findOne({
                resetPasswordToken: token,
                resetPasswordExpires: { $gt: Date.now() }
            });

            if (!user) {
                throw new Error("El token de restablecimiento es inválido o ha expirado.");
            }

            if (await bcrypt.compare(newPassword, user.password)) {
                throw new Error("No puede usar la misma contraseña anterior.");
            }

            user.password = await bcrypt.hash(newPassword, 10);
            user.resetPasswordToken = undefined;
            user.resetPasswordExpires = undefined;
            await user.save();

            return "Contraseña restablecida con éxito";
        } catch (error) {
            logger.error("Error al restablecer la contraseña:", error.message);
            throw error;
        }
    }
};

export default userService;