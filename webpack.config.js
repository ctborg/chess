import path from "path";
import HtmlWebpackPlugin from "html-webpack-plugin";
import MiniCssExtractPlugin from "mini-css-extract-plugin";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const isProd = process.env.NODE_ENV === "production";

/** @type {import('webpack').Configuration} */
export default {
  mode: isProd ? "production" : "development",
  entry: "./src/index.jsx",
  output: {
    path: path.resolve(__dirname, "dist"),
    filename: "js/[name].[contenthash:8].js",               // hashed JS
    chunkFilename: "js/[name].[contenthash:8].chunk.js",     // hashed chunks
    clean: true,
    publicPath: "/"
  },
  module: {
    rules: [
      {
        test: /\.(js|jsx)$/i,
        exclude: /node_modules/,
        use: "babel-loader"
      },
      {
        test: /\.s[ac]ss$/i,
        use: [
          isProd ? MiniCssExtractPlugin.loader : "style-loader", // extract in prod
          "css-loader",
          "sass-loader"
        ]
      },
      {
        test: /\.(glb|gltf)$/i,
        type: "asset/resource",
        generator: { filename: "assets/models/[name].[contenthash:8][ext]" } // hashed
      },
      {
        test: /\.(png|jpg|jpeg|svg)$/i,
        type: "asset/resource",
        generator: { filename: "assets/textures/[name].[contenthash:8][ext]" } // hashed
      }
    ]
  },
  resolve: {
    extensions: [".js", ".jsx"]
  },
  plugins: [
    new HtmlWebpackPlugin({
      inject: "body",
      templateContent: `
        <!doctype html>
        <html lang="en">
          <head>
            <meta charset="utf-8" />
            <meta name="viewport" content="width=device-width,initial-scale=1" />
            <title>Chess</title>
          </head>
          <body>
            <div id="root"></div>
          </body>
        </html>
      `
    }),
    ...(isProd
      ? [new MiniCssExtractPlugin({ filename: "css/[name].[contenthash:8].css" })]
      : [])
  ],
  optimization: {
    splitChunks: { chunks: "all" },
    runtimeChunk: "single"
  },
  devtool: isProd ? "source-map" : "eval-cheap-module-source-map",
  devServer: {
    historyApiFallback: true,
    hot: true
  }
};
